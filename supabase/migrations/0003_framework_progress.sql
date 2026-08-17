-- My Assistant framework progress tracking: sync vault hierarchy stats into Supabase.
-- Base tables are only ever written by Edge Functions (via the service role key,
-- which bypasses RLS). The plugin's anon key can only SELECT from the v_* views.

-- ============================================================
-- persona_progress_snapshots — daily snapshot of quest/duty/task counts per persona.
-- ============================================================
create table public.persona_progress_snapshots (
  id bigint generated always as identity primary key,
  persona text not null,                        -- matches vault `persona:` frontmatter
  snapshot_date date not null,
  active_quest_count integer not null default 0,
  active_duty_count integer not null default 0,
  active_task_count integer not null default 0,
  done_task_count integer not null default 0,   -- tasks completed on this calendar day
  active_stage text,                            -- name of the currently active (status: active) stage
  stage_progress_pct integer,                   -- completion % of the active stage's children (0-100)
  active_milestone text,                        -- name of the currently active milestone within that stage
  milestone_progress_pct integer,               -- completion % of the active milestone's children (0-100)
  fetched_at timestamptz not null default now(),
  unique (persona, snapshot_date)               -- upsert target: same-day re-run overwrites
);
create index persona_progress_snapshots_persona_date_idx on public.persona_progress_snapshots (persona, snapshot_date desc);

-- ============================================================
-- habit_streak_snapshots — daily snapshot of streaks for recurring tasks per persona.
-- ============================================================
create table public.habit_streak_snapshots (
  id bigint generated always as identity primary key,
  persona text not null,
  habit_name text not null,                     -- matches vault task file's filename (or display title)
  snapshot_date date not null,
  current_streak integer not null default 0,    -- consecutive completed occurrences counting back from today
  completed_today boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (persona, habit_name, snapshot_date)   -- upsert target
);
create index habit_streak_snapshots_persona_date_idx on public.habit_streak_snapshots (persona, snapshot_date desc);

-- ============================================================
-- RLS: default-deny on new base tables for anon/authenticated.
-- ============================================================
alter table public.persona_progress_snapshots enable row level security;
alter table public.habit_streak_snapshots enable row level security;

revoke all on public.persona_progress_snapshots, public.habit_streak_snapshots
  from anon, authenticated;

-- ============================================================
-- Views — the ONLY thing the plugin's anon key is allowed to touch.
-- ============================================================

create view public.v_persona_progress_latest as
  select distinct on (persona)
    persona, snapshot_date, active_quest_count, active_duty_count, active_task_count,
    done_task_count, active_stage, stage_progress_pct, active_milestone, milestone_progress_pct
  from public.persona_progress_snapshots
  order by persona, snapshot_date desc;

create view public.v_persona_progress_history as
  select persona, snapshot_date, active_quest_count, active_duty_count, active_task_count, done_task_count
  from public.persona_progress_snapshots
  order by persona, snapshot_date;

create view public.v_habit_streaks_latest as
  select distinct on (persona, habit_name)
    persona, habit_name, snapshot_date, current_streak, completed_today
  from public.habit_streak_snapshots
  order by persona, habit_name, snapshot_date desc;

grant usage on schema public to anon;
grant select on
  public.v_persona_progress_latest, public.v_persona_progress_history, public.v_habit_streaks_latest
to anon;
