-- Daily background snapshotting so star/rating history keeps accumulating
-- even when Obsidian is never opened. Idempotent by design: repo_snapshots
-- and lichess_snapshots both upsert on a (..., snapshot_date) unique key, so
-- a cron run and a same-day manual Refresh from the plugin just overwrite
-- that day's row — no duplicate rows, no special-casing needed here.
--
-- IMPORTANT — before running `supabase db push`:
-- Replace YOUR-PROJECT-REF below with your actual project ref (the subdomain
-- segment of your Supabase project URL, e.g. "abcdefghijklmnop"). This file
-- intentionally contains no API key — github-refresh/lichess-refresh must
-- have `verify_jwt = false` set in supabase/config.toml (already configured)
-- so this unauthenticated call is accepted. See supabase/config.toml and the
-- plan's cron section for the (optional) Vault-based hardened alternative.

select cron.schedule(
  'daily-github-refresh',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/github-refresh',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'daily-lichess-refresh',
  '5 6 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/lichess-refresh',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
