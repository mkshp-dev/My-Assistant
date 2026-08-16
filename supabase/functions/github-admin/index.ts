// Config-write actions for the Guru dashboard's tracked-repo list, invoked
// directly by the Obsidian plugin's Settings tab (never by cron).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";

interface SetReposBody {
  action: "set_repos";
  repos: { repo: string; releasePeriodDays?: number }[];
}
interface TestTokenBody {
  action: "test_token";
}
interface TestRepoBody {
  action: "test_repo";
  repo: string;
}
interface BackfillStarsBody {
  action: "backfill_stars";
  repo: string;
}
type RequestBody = SetReposBody | TestTokenBody | TestRepoBody | BackfillStarsBody;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": "Obsidian-My-Assistant-Plugin",
    "Accept": "application/vnd.github+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  return headers;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (body.action === "test_token") {
    if (!GITHUB_TOKEN) {
      return json({ success: false, error: "GITHUB_TOKEN secret is not set on the Supabase project." });
    }
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          "User-Agent": "Obsidian-My-Assistant-Plugin",
          "Accept": "application/vnd.github+json",
          "Authorization": `token ${GITHUB_TOKEN}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data?.login) {
        return json({ success: true, username: data.login });
      }
      return json({ success: false, error: `HTTP ${res.status}: Invalid token` });
    } catch (err) {
      return json({ success: false, error: err instanceof Error ? err.message : "Failed to authenticate token" });
    }
  }

  if (body.action === "test_repo") {
    const repoFullName = body.repo?.trim();
    if (!repoFullName || !repoFullName.includes("/")) {
      return json({ success: false, error: 'Expected "owner/repo" format.' });
    }
    try {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers: githubHeaders() });
      if (res.status !== 200) {
        return json({ success: false, error: `HTTP ${res.status}: repository not found or not accessible.` });
      }
      const data = await res.json();
      return json({
        success: true,
        repo: {
          full_name: data.full_name,
          description: data.description,
          stargazers_count: data.stargazers_count,
        },
      });
    } catch (err) {
      return json({ success: false, error: err instanceof Error ? err.message : "Failed to reach GitHub." });
    }
  }

  if (body.action === "backfill_stars") {
    const repoFullName = body.repo?.trim();
    if (!repoFullName) return json({ ok: false, error: "repo is required" }, 400);

    const { data: repoRow, error: repoError } = await supabase
      .from("tracked_repos")
      .select("id, repo_full_name")
      .ilike("repo_full_name", repoFullName)
      .maybeSingle();

    if (repoError) return json({ ok: false, error: repoError.message }, 500);
    if (!repoRow) return json({ ok: false, error: "Repository is not tracked yet — add and save it first." }, 400);

    // GitHub has no "stars over time" API, but the stargazers list — when
    // requested with this special media type — includes each star's
    // starred_at timestamp. Reconstructing the cumulative curve from those
    // events is the same trick sites like star-history.com use.
    const timestamps: string[] = [];
    const maxPages = 30; // safety cap: 30 * 100 = up to 3000 stars
    let truncated = false;
    let page = 1;

    while (page <= maxPages) {
      const res = await fetch(
        `https://api.github.com/repos/${repoRow.repo_full_name}/stargazers?per_page=100&page=${page}`,
        {
          headers: {
            ...githubHeaders(),
            "Accept": "application/vnd.github.star+json",
          },
        }
      );
      if (res.status !== 200) {
        return json({ ok: false, error: `HTTP ${res.status} fetching stargazers (page ${page})` }, 500);
      }
      // deno-lint-ignore no-explicit-any
      const batch: any[] = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const entry of batch) {
        if (entry?.starred_at) timestamps.push(entry.starred_at);
      }

      if (batch.length < 100) break;
      page += 1;
      if (page > maxPages) truncated = true;
    }

    if (timestamps.length === 0) {
      return json({ ok: true, repo: repoRow.repo_full_name, daysBackfilled: 0, totalStars: 0 });
    }

    // Sort defensively rather than trusting API order, then bucket into one
    // cumulative-count row per calendar day a star event happened.
    timestamps.sort();
    const dailyCounts = new Map<string, number>();
    let cumulative = 0;
    for (const ts of timestamps) {
      cumulative += 1;
      dailyCounts.set(ts.slice(0, 10), cumulative);
    }

    const rows = Array.from(dailyCounts.entries()).map(([snapshot_date, stargazers_count]) => ({
      repo_id: repoRow.id,
      snapshot_date,
      stargazers_count,
    }));

    // Only stargazers_count (+ the conflict key) is in this payload, so on
    // conflict with an existing row (e.g. today's real refresh snapshot)
    // this updates just the star count — it never clobbers that day's
    // issues/forks/release data written by github-refresh.
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from("repo_snapshots")
        .upsert(chunk, { onConflict: "repo_id,snapshot_date" });
      if (upsertError) return json({ ok: false, error: upsertError.message }, 500);
    }

    return json({
      ok: true,
      repo: repoRow.repo_full_name,
      daysBackfilled: rows.length,
      totalStars: cumulative,
      truncated,
    });
  }

  if (body.action === "set_repos") {
    const incoming = (body.repos || [])
      .map((r) => ({ repo: r.repo.trim(), releasePeriodDays: r.releasePeriodDays }))
      .filter((r) => r.repo.length > 0);

    const { data: existing, error: existingError } = await supabase
      .from("tracked_repos")
      .select("id, repo_full_name, is_active");

    if (existingError) return json({ ok: false, error: existingError.message }, 500);

    const incomingLower = new Set(incoming.map((r) => r.repo.toLowerCase()));

    // Soft-delete anything active that's no longer in the incoming list —
    // preserves its repo_snapshots/repo_events history instead of losing it.
    const toDeactivate = (existing ?? [])
      .filter((r) => r.is_active && !incomingLower.has(r.repo_full_name.toLowerCase()))
      .map((r) => r.id);
    if (toDeactivate.length > 0) {
      await supabase
        .from("tracked_repos")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", toDeactivate);
    }

    for (const r of incoming) {
      const match = (existing ?? []).find((e) => e.repo_full_name.toLowerCase() === r.repo.toLowerCase());
      if (match) {
        await supabase
          .from("tracked_repos")
          .update({
            repo_full_name: r.repo,
            release_period_days: r.releasePeriodDays ?? null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id);
      } else {
        await supabase.from("tracked_repos").insert({
          repo_full_name: r.repo,
          release_period_days: r.releasePeriodDays ?? null,
        });
      }
    }

    const { data: active, error: activeError } = await supabase
      .from("tracked_repos")
      .select("repo_full_name, release_period_days")
      .eq("is_active", true)
      .order("repo_full_name");

    if (activeError) return json({ ok: false, error: activeError.message }, 500);

    return json({
      ok: true,
      active: (active ?? []).map((r) => ({
        repo: r.repo_full_name,
        releasePeriodDays: r.release_period_days ?? undefined,
      })),
    });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
});
