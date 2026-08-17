// Fetches the tracked Lichess user's current rapid rating and upserts it
// into lichess_snapshots. Invoked by the plugin's Refresh button AND by the
// daily pg_cron job (supabase/migrations/0002_cron.sql).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface LichessPerf {
  games: number;
  rating: number;
  rd: number;
  prog: number;
  prov?: boolean;
}

interface LichessUserData {
  username: string;
  title?: string;
  url: string;
  online: boolean;
  perfs: Record<string, LichessPerf | undefined>;
  error?: string;
}

async function fetchLichessUser(username: string): Promise<LichessUserData> {
  try {
    const res = await fetch(`https://lichess.org/api/user/${username}`, {
      headers: { "User-Agent": "Obsidian-My-Assistant-Plugin", "Accept": "application/json" },
    });
    if (res.status !== 200) {
      return { username, url: `https://lichess.org/@/${username}`, online: false, perfs: {}, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      username: data.username || username,
      title: data.title,
      url: data.url || `https://lichess.org/@/${username}`,
      online: !!data.online,
      perfs: data.perfs || {},
    };
  } catch (err) {
    return {
      username,
      url: `https://lichess.org/@/${username}`,
      online: false,
      perfs: {},
      error: err instanceof Error ? err.message : "Failed to fetch Lichess data",
    };
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

  const { data: config, error: configError } = await supabase
    .from("lichess_config")
    .select("username")
    .eq("id", true)
    .single();

  if (configError || !config) {
    return new Response(
      JSON.stringify({ ok: false, error: configError?.message || "No Lichess username configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const userData = await fetchLichessUser(config.username);
  const rapid = userData.perfs?.rapid;
  const today = new Date().toISOString().slice(0, 10);

  const { error: upsertError } = await supabase.from("lichess_snapshots").upsert(
    {
      snapshot_date: today,
      username: userData.username,
      title: userData.title || null,
      profile_url: userData.url,
      online: userData.online,
      rating_rapid: rapid?.rating ?? null,
      games_rapid: rapid?.games ?? null,
      prog_rapid: rapid?.prog ?? null,
      prov_rapid: rapid?.prov ?? null,
      perfs_raw: userData.perfs,
      fetch_error: userData.error ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "snapshot_date" }
  );

  if (upsertError) {
    return new Response(JSON.stringify({ ok: false, error: upsertError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, snapshotDate: today, rating: rapid?.rating ?? null, error: userData.error }),
    { headers: { "Content-Type": "application/json" } }
  );
});
