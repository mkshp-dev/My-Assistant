// Config-write actions for the Gymnast dashboard's tracked Lichess username,
// invoked directly by the Obsidian plugin's Settings tab (never by cron).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SetUsernameBody {
  action: "set_username";
  username: string;
}
interface BackfillRatingBody {
  action: "backfill_rating";
}
type RequestBody = SetUsernameBody | BackfillRatingBody;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

  if (body.action === "set_username") {
    if (!body.username?.trim()) {
      return json({ ok: false, error: 'Expected { action: "set_username", username: string }' }, 400);
    }
    const username = body.username.trim();

    const { error } = await supabase
      .from("lichess_config")
      .update({ username, updated_at: new Date().toISOString() })
      .eq("id", true);

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, username });
  }

  if (body.action === "backfill_rating") {
    const { data: config, error: configError } = await supabase
      .from("lichess_config")
      .select("username")
      .eq("id", true)
      .single();

    if (configError || !config) {
      return json({ ok: false, error: configError?.message || "No Lichess username configured" }, 500);
    }

    // Lichess, unlike GitHub, has an official endpoint for this: full daily
    // rating history per game mode, going back to the account's start.
    const res = await fetch(`https://lichess.org/api/user/${config.username}/rating-history`, {
      headers: { "User-Agent": "Obsidian-My-Assistant-Plugin", "Accept": "application/json" },
    });
    if (res.status !== 200) {
      return json({ ok: false, error: `HTTP ${res.status} fetching rating history` }, 500);
    }

    // deno-lint-ignore no-explicit-any
    const data: any[] = await res.json();
    if (!Array.isArray(data)) {
      return json({ ok: false, error: "Unexpected response shape from Lichess" }, 500);
    }

    const rapidEntry = data.find((d) => d.name === "Rapid");
    if (!rapidEntry || !Array.isArray(rapidEntry.points) || rapidEntry.points.length === 0) {
      return json({ ok: true, daysBackfilled: 0 });
    }

    // Points are [year, month(0-indexed), day, rating].
    const rows = (rapidEntry.points as number[][]).map(([year, month, day, rating]) => ({
      snapshot_date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      username: config.username,
      rating_rapid: rating,
    }));

    // Only snapshot_date/username/rating_rapid are in this payload, so on
    // conflict with an existing row (e.g. today's real refresh snapshot)
    // this updates just the rating — it never clobbers that day's
    // online/title/games data written by lichess-refresh.
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from("lichess_snapshots")
        .upsert(chunk, { onConflict: "snapshot_date" });
      if (upsertError) return json({ ok: false, error: upsertError.message }, 500);
    }

    return json({
      ok: true,
      daysBackfilled: rows.length,
      earliestDate: rows[0].snapshot_date,
      latestDate: rows[rows.length - 1].snapshot_date,
    });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
});
