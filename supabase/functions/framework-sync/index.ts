// Vault framework progress sync: receive computed persona progress data from the Obsidian
// plugin and upsert into persona_progress_snapshots and habit_streak_snapshots.
// Invoked directly by the plugin's Settings tab when user clicks "Sync Framework Progress".
import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface HabitStreakPayload {
  name: string;
  currentStreak: number;
  completedToday: boolean;
}

interface PersonaProgressPayload {
  persona: string;
  activeQuestCount: number;
  activeDutyCount: number;
  activeTaskCount: number;
  doneTaskCount: number;
  activeStage: string | null;
  stageProgressPct: number | null;
  activeMilestone: string | null;
  milestoneProgressPct: number | null;
  habits: HabitStreakPayload[];
}

interface RequestBody {
  snapshotDate: string; // YYYY-MM-DD ISO date
  personas: PersonaProgressPayload[];
}

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

  if (!body.snapshotDate || !Array.isArray(body.personas)) {
    return json({ ok: false, error: "snapshotDate and personas array are required" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const snapshotDate = body.snapshotDate;

  try {
    // Upsert persona_progress_snapshots
    const progressRows = body.personas.map((p) => ({
      persona: p.persona,
      snapshot_date: snapshotDate,
      active_quest_count: p.activeQuestCount,
      active_duty_count: p.activeDutyCount,
      active_task_count: p.activeTaskCount,
      done_task_count: p.doneTaskCount,
      active_stage: p.activeStage,
      stage_progress_pct: p.stageProgressPct,
      active_milestone: p.activeMilestone,
      milestone_progress_pct: p.milestoneProgressPct,
    }));

    const { error: progressError } = await supabase
      .from("persona_progress_snapshots")
      .upsert(progressRows, { onConflict: "persona,snapshot_date" });

    if (progressError) return json({ ok: false, error: progressError.message }, 500);

    // Upsert habit_streak_snapshots
    const habitRows: Array<{
      persona: string;
      habit_name: string;
      snapshot_date: string;
      current_streak: number;
      completed_today: boolean;
    }> = [];

    for (const persona of body.personas) {
      for (const habit of persona.habits) {
        habitRows.push({
          persona: persona.persona,
          habit_name: habit.name,
          snapshot_date: snapshotDate,
          current_streak: habit.currentStreak,
          completed_today: habit.completedToday,
        });
      }
    }

    if (habitRows.length > 0) {
      const { error: habitError } = await supabase
        .from("habit_streak_snapshots")
        .upsert(habitRows, { onConflict: "persona,habit_name,snapshot_date" });

      if (habitError) return json({ ok: false, error: habitError.message }, 500);
    }

    return json({
      ok: true,
      snapshotDate,
      personasProcessed: body.personas.length,
      habitsProcessed: habitRows.length,
    });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      500
    );
  }
});
