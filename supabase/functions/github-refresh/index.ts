// Fetches current stats + recent events for every active tracked repo and
// upserts them into repo_snapshots / repo_events. Invoked by the Obsidian
// plugin's "Refresh" button AND by the daily pg_cron job
// (supabase/migrations/0002_cron.sql) — safe to call repeatedly on the same
// day, since both writes upsert on a stable key.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";

interface RepoDetails {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  open_issues_count: number;
  forks_count: number;
  html_url: string;
  pushed_at: string;
  latest_release_tag?: string;
  latest_release_url?: string;
  latest_release_date?: string;
  error?: string;
}

interface RepoEvent {
  id: string;
  type: string;
  actor: string;
  created_at: string;
  title: string;
  detail?: string;
  url?: string;
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": "Obsidian-My-Assistant-Plugin",
    "Accept": "application/vnd.github+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  return headers;
}

async function fetchRepoDetails(repoFullName: string): Promise<RepoDetails> {
  const fallback = (error: string): RepoDetails => ({
    full_name: repoFullName,
    description: null,
    stargazers_count: 0,
    open_issues_count: 0,
    forks_count: 0,
    html_url: `https://github.com/${repoFullName}`,
    pushed_at: "",
    error,
  });

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers: githubHeaders() });
    if (repoRes.status !== 200) return fallback(`HTTP ${repoRes.status}`);

    const data = await repoRes.json();
    const details: RepoDetails = {
      full_name: data.full_name,
      description: data.description,
      stargazers_count: data.stargazers_count,
      open_issues_count: data.open_issues_count,
      forks_count: data.forks_count,
      html_url: data.html_url,
      pushed_at: data.pushed_at,
    };

    try {
      const releaseRes = await fetch(`https://api.github.com/repos/${repoFullName}/releases/latest`, { headers: githubHeaders() });
      if (releaseRes.status === 200) {
        const release = await releaseRes.json();
        details.latest_release_tag = release.tag_name;
        details.latest_release_url = release.html_url;
        details.latest_release_date = release.published_at;
      }
    } catch {
      // Repo may have no releases — ignore.
    }

    return details;
  } catch (err) {
    return fallback(err instanceof Error ? err.message : "Failed to fetch repository details");
  }
}

// deno-lint-ignore no-explicit-any
function mapEvent(raw: any, repoFullName: string): RepoEvent {
  let title = `${raw.type} by @${raw.actor?.login || "someone"}`;
  let detail = "";
  let url = `https://github.com/${repoFullName}`;

  switch (raw.type) {
    case "WatchEvent":
      title = `⭐ @${raw.actor?.login} starred the repository`;
      break;
    case "ForkEvent":
      title = `🍴 @${raw.actor?.login} forked the repository`;
      url = raw.payload?.forkee?.html_url || url;
      break;
    case "IssuesEvent":
      title = `📌 Issue ${raw.payload?.action}: "${raw.payload?.issue?.title || ""}" by @${raw.actor?.login}`;
      url = raw.payload?.issue?.html_url || url;
      break;
    case "IssueCommentEvent":
      title = `💬 New comment on #${raw.payload?.issue?.number} by @${raw.actor?.login}`;
      detail = raw.payload?.comment?.body ? raw.payload.comment.body.substring(0, 100) + "..." : "";
      url = raw.payload?.comment?.html_url || raw.payload?.issue?.html_url || url;
      break;
    case "PushEvent": {
      const commitCount = raw.payload?.commits?.length || 1;
      const branch = raw.payload?.ref ? raw.payload.ref.replace("refs/heads/", "") : "main";
      title = `🚀 @${raw.actor?.login} pushed ${commitCount} commit(s) to ${branch}`;
      if (raw.payload?.commits?.[0]?.message) {
        detail = raw.payload.commits[0].message.split("\n")[0];
      }
      break;
    }
    case "ReleaseEvent":
      title = `🎉 New Release published: ${raw.payload?.release?.tag_name} by @${raw.actor?.login}`;
      url = raw.payload?.release?.html_url || url;
      break;
    case "CreateEvent":
      title = `✨ Created ${raw.payload?.ref_type} ${raw.payload?.ref || ""} by @${raw.actor?.login}`;
      break;
    case "PullRequestEvent":
      title = `🔀 Pull Request ${raw.payload?.action}: "${raw.payload?.pull_request?.title || ""}" by @${raw.actor?.login}`;
      url = raw.payload?.pull_request?.html_url || url;
      break;
  }

  return {
    id: String(raw.id),
    type: raw.type,
    actor: raw.actor?.login || "unknown",
    created_at: raw.created_at,
    title,
    detail,
    url,
  };
}

async function fetchRepoEvents(repoFullName: string, sinceIso: string | null): Promise<RepoEvent[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/events?per_page=30`, { headers: githubHeaders() });
    if (res.status !== 200) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    const sinceTime = sinceIso ? new Date(sinceIso).getTime() : 0;
    // deno-lint-ignore no-explicit-any
    return raw
      .filter((e: any) => !sinceTime || new Date(e.created_at).getTime() > sinceTime)
      .map((e: any) => mapEvent(e, repoFullName));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: repos, error: reposError } = await supabase
    .from("tracked_repos")
    .select("id, repo_full_name")
    .eq("is_active", true);

  if (reposError) {
    return new Response(JSON.stringify({ ok: false, error: reposError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: { repo: string; ok: boolean; error?: string }[] = [];
  let newEventCount = 0;

  // Sequential, not parallel — this is a handful of personal repos, and
  // staying sequential keeps GitHub rate-limit usage predictable.
  for (const repo of repos ?? []) {
    const details = await fetchRepoDetails(repo.repo_full_name);

    const { error: upsertError } = await supabase.from("repo_snapshots").upsert(
      {
        repo_id: repo.id,
        snapshot_date: today,
        description: details.description,
        stargazers_count: details.stargazers_count,
        open_issues_count: details.open_issues_count,
        forks_count: details.forks_count,
        html_url: details.html_url,
        pushed_at: details.pushed_at || null,
        latest_release_tag: details.latest_release_tag ?? null,
        latest_release_url: details.latest_release_url ?? null,
        latest_release_date: details.latest_release_date ?? null,
        fetch_error: details.error ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "repo_id,snapshot_date" }
    );

    results.push({
      repo: repo.repo_full_name,
      ok: !details.error && !upsertError,
      error: details.error || upsertError?.message,
    });

    if (details.error) continue;

    // Per-repo cursor (replaces the old client-side global lastGuruRefreshTime,
    // which cron runs have no client to maintain).
    const { data: cursorRow } = await supabase
      .from("repo_events")
      .select("created_at")
      .eq("repo_id", repo.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const events = await fetchRepoEvents(repo.repo_full_name, cursorRow?.created_at ?? null);
    if (events.length > 0) {
      const { error: eventsError } = await supabase.from("repo_events").upsert(
        events.map((e) => ({
          id: e.id,
          repo_id: repo.id,
          event_type: e.type,
          actor: e.actor,
          created_at: e.created_at,
          title: e.title,
          detail: e.detail || null,
          url: e.url || null,
        })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (!eventsError) newEventCount += events.length;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, refreshedAt: new Date().toISOString(), repos: results, newEventCount }),
    { headers: { "Content-Type": "application/json" } }
  );
});
