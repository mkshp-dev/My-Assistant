-- My Assistant dashboards: schema for GitHub star history + Lichess rating history.
-- Base tables are only ever written by Edge Functions (via the service role key,
-- which bypasses RLS). The plugin's anon key can only SELECT from the v_* views
-- defined at the bottom of this file.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- tracked_repos — which GitHub repos to track, and their target release cadence.
-- ============================================================
create table public.tracked_repos (
  id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  release_period_days integer,
  is_active boolean not null default true,   -- soft delete: preserves history
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- GitHub repo paths are case-insensitive; this is the only uniqueness needed.
create unique index tracked_repos_lower_name_idx on public.tracked_repos (lower(repo_full_name));

-- ============================================================
-- repo_snapshots — one row per repo per calendar day (UTC).
-- ============================================================
create table public.repo_snapshots (
  id bigint generated always as identity primary key,
  repo_id uuid not null references public.tracked_repos(id) on delete cascade,
  snapshot_date date not null,
  description text,
  stargazers_count integer not null default 0,
  open_issues_count integer not null default 0,
  forks_count integer not null default 0,
  html_url text,
  pushed_at timestamptz,
  latest_release_tag text,
  latest_release_url text,
  latest_release_date timestamptz,
  fetch_error text,
  fetched_at timestamptz not null default now(),
  unique (repo_id, snapshot_date)   -- upsert target: same-day re-run overwrites, never duplicates
);
create index repo_snapshots_repo_date_idx on public.repo_snapshots (repo_id, snapshot_date desc);

-- ============================================================
-- repo_events — notification-bell feed, deduped by GitHub's own event id.
-- ============================================================
create table public.repo_events (
  id text primary key,                -- GitHub event id, used verbatim as the dedupe key
  repo_id uuid not null references public.tracked_repos(id) on delete cascade,
  event_type text not null,
  actor text,
  created_at timestamptz not null,
  title text not null,
  detail text,
  url text,
  inserted_at timestamptz not null default now()
);
create index repo_events_repo_created_idx on public.repo_events (repo_id, created_at desc);

-- ============================================================
-- lichess_config — singleton table. Server-side home for the tracked
-- username, since cron-triggered runs have no client to supply it from.
-- ============================================================
create table public.lichess_config (
  id boolean primary key default true,
  username text not null default 'tomatopotato69',
  updated_at timestamptz not null default now(),
  constraint lichess_config_singleton check (id)
);
insert into public.lichess_config (id, username) values (true, 'tomatopotato69');

-- ============================================================
-- lichess_snapshots — one row per calendar day (UTC).
-- ============================================================
create table public.lichess_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null unique,
  username text not null,
  title text,
  profile_url text,
  online boolean not null default false,
  rating_rapid integer,
  games_rapid integer,
  prog_rapid integer,
  prov_rapid boolean,
  perfs_raw jsonb,          -- full perfs payload (blitz/bullet/etc), future-proofing
  fetch_error text,
  fetched_at timestamptz not null default now()
);
create index lichess_snapshots_date_idx on public.lichess_snapshots (snapshot_date desc);

-- ============================================================
-- RLS: default-deny on every base table for anon/authenticated.
-- No policies are created — RLS with zero policies means zero access.
-- Edge Functions use the service role key, which bypasses RLS entirely
-- regardless of policies, so writes still work there.
-- ============================================================
alter table public.tracked_repos     enable row level security;
alter table public.repo_snapshots    enable row level security;
alter table public.repo_events       enable row level security;
alter table public.lichess_config    enable row level security;
alter table public.lichess_snapshots enable row level security;

revoke all on public.tracked_repos, public.repo_snapshots, public.repo_events,
  public.lichess_config, public.lichess_snapshots
  from anon, authenticated;

-- ============================================================
-- Views — the ONLY thing the plugin's anon key is allowed to touch.
-- Views run with their owner's privileges by default (classic Postgres view
-- semantics), so they read past RLS on the base tables even though `anon`
-- itself has zero grants there.
-- ============================================================

create view public.v_tracked_repos as
  select id, repo_full_name, release_period_days
  from public.tracked_repos
  where is_active
  order by repo_full_name;

create view public.v_repo_latest as
  select distinct on (r.id)
    r.id as repo_id, r.repo_full_name, r.release_period_days,
    s.snapshot_date, s.description, s.stargazers_count, s.open_issues_count,
    s.forks_count, s.html_url, s.pushed_at, s.latest_release_tag,
    s.latest_release_url, s.latest_release_date, s.fetch_error
  from public.tracked_repos r
  join public.repo_snapshots s on s.repo_id = r.id
  where r.is_active
  order by r.id, s.snapshot_date desc;

create view public.v_repo_star_history as
  select r.repo_full_name, s.snapshot_date, s.stargazers_count
  from public.repo_snapshots s
  join public.tracked_repos r on r.id = s.repo_id
  where r.is_active
  order by r.repo_full_name, s.snapshot_date;

create view public.v_repo_events_recent as
  select e.id, r.repo_full_name, e.event_type, e.actor, e.created_at,
         e.title, e.detail, e.url
  from public.repo_events e
  join public.tracked_repos r on r.id = e.repo_id
  where r.is_active
  order by e.created_at desc;   -- client appends ?limit=10 via PostgREST query string

create view public.v_lichess_config as
  select username from public.lichess_config;

create view public.v_lichess_latest as
  select snapshot_date, username, title, profile_url, online,
         rating_rapid, games_rapid, prog_rapid, prov_rapid, fetch_error
  from public.lichess_snapshots
  order by snapshot_date desc
  limit 1;

create view public.v_lichess_rating_history as
  select snapshot_date, rating_rapid
  from public.lichess_snapshots
  where rating_rapid is not null
  order by snapshot_date;

grant usage on schema public to anon;
grant select on
  public.v_tracked_repos, public.v_repo_latest, public.v_repo_star_history,
  public.v_repo_events_recent, public.v_lichess_config, public.v_lichess_latest,
  public.v_lichess_rating_history
to anon;
