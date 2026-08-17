import { App } from 'obsidian';
import type { QuestStatus } from '../types';
import {
	getPersonas,
	getStages,
	getMilestones,
	getObjectives,
	getQuests,
	getDuties
} from './vault-scanner';

/**
 * RFC 5545 RRULE string parser for simple recurring-task scenarios.
 * Extracts FREQ and BYDAY/BYMONTHDAY to determine if a task occurred today.
 * Returns the day-count for streak calculation (e.g. 1 for daily, 7 for weekly).
 */
function parseRRule(rruleStr: string): { freq: string; dayIntervalDays: number } | null {
	if (!rruleStr) return null;

	const freqMatch = rruleStr.match(/FREQ=(\w+)/i);
	if (!freqMatch) return null;

	const freq = freqMatch[1].toUpperCase();

	// For simplicity, map FREQ to an interval in days for streak calculation.
	// A weekly task on Mon/Wed/Fri has dayIntervalDays=7 but may skip 2 days between occurrences.
	// For now, we'll use a simplified heuristic: daily=1, weekly=7, etc.
	const dayIntervalDays =
		freq === 'DAILY' ? 1 :
		freq === 'WEEKLY' ? 7 :
		freq === 'MONTHLY' ? 30 :
		freq === 'YEARLY' ? 365 :
		7; // default to weekly

	return { freq, dayIntervalDays };
}

/**
 * Calculate the current streak for a recurring task based on complete_instances.
 * Returns the count of consecutive completed occurrences counting back from today
 * according to the task's RRULE cadence.
 */
function calculateStreak(
	recurrence: string | undefined,
	completeInstances: string[] | undefined,
	today: string
): number {
	if (!recurrence || !Array.isArray(completeInstances) || completeInstances.length === 0) {
		return 0;
	}

	const rrule = parseRRule(recurrence);
	if (!rrule) return 0;

	// Sort dates in descending order (most recent first)
	const sortedDates = [...completeInstances].sort().reverse();

	let streak = 0;
	let expectedDate = today;

	for (const completedDate of sortedDates) {
		if (completedDate === expectedDate) {
			streak++;
			// Move back by the interval (e.g. 7 days for weekly)
			const date = new Date(expectedDate);
			date.setDate(date.getDate() - rrule.dayIntervalDays);
			expectedDate = date.toISOString().split('T')[0];
		} else {
			// Gap found; streak broken
			break;
		}
	}

	return streak;
}

/**
 * Count entities with a "done" status (normalize complete/done/completed).
 */
function isEntityDone(status: string | undefined): boolean {
	const s = String(status || '').toLowerCase();
	return s === 'complete' || s === 'done' || s === 'completed';
}

/**
 * Compute completion % for a list of entities with status field.
 */
function computeProgressPct(entities: Array<{ status?: string | QuestStatus }>): number {
	if (entities.length === 0) return 0;
	const completed = entities.filter(e => isEntityDone(String(e.status))).length;
	return Math.round((completed / entities.length) * 100);
}

export interface HabitStreakPayload {
	name: string;
	currentStreak: number;
	completedToday: boolean;
}

export interface PersonaProgressPayload {
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

export async function computeFrameworkProgress(app: App): Promise<PersonaProgressPayload[]> {
	const personas = getPersonas(app);
	const stages = getStages(app);
	const milestones = getMilestones(app);
	const objectives = getObjectives(app);
	const quests = getQuests(app);
	const duties = getDuties(app);

	// Get all markdown files to scan for task-level data
	const files = app.vault.getMarkdownFiles();
	const today = new Date().toISOString().split('T')[0];

	const result: PersonaProgressPayload[] = [];

	for (const persona of personas) {
		// Count active quests/duties/tasks for this persona
		const personaQuests = quests.filter(q => q.persona === persona.name && q.status === 'active');
		const personaDuties = duties.filter(d => d.persona === persona.name && d.status === 'active');

		// Count active tasks (status not in done/completed/future)
		let activeTaskCount = 0;
		let doneTaskCount = 0;
		const habits: HabitStreakPayload[] = [];

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;
			if (!frontmatter) continue;

			const kind = String(frontmatter.kind || '').toLowerCase();
			if (kind !== 'task') continue;

			const taskPersona = frontmatter.persona;
			if (taskPersona !== persona.name) continue;

			const status = String(frontmatter.status || 'active').toLowerCase();

			// Count active tasks
			if (status !== 'done' && status !== 'completed' && status !== 'future') {
				activeTaskCount++;
			}

			// Count tasks completed today (check if completedDate equals today)
			const completedDate = frontmatter.completedDate;
			if (completedDate === today) {
				doneTaskCount++;
			}

			// Track habit streaks for recurring tasks
			const recurrence = frontmatter.recurrence;
			if (recurrence) {
				const habitName = file.basename;
				const completeInstances = frontmatter.complete_instances;
				const currentStreak = calculateStreak(recurrence, completeInstances, today);
				const completedToday = Array.isArray(completeInstances) && completeInstances.includes(today);

				habits.push({
					name: habitName,
					currentStreak,
					completedToday
				});
			}
		}

		// Find active stage/milestone and compute progress %
		const personaStages = stages.filter(s => s.persona === persona.name && s.name !== 'Builder' && s.name !== 'Mastery' && s.name !== 'Athlete');
		const activeStageData = personaStages.length > 0 ? personaStages[0] : null;
		let activeStage: string | null = null;
		let stageProgressPct: number | null = null;
		let activeMilestone: string | null = null;
		let milestoneProgressPct: number | null = null;

		if (activeStageData) {
			activeStage = activeStageData.name;

			// Get all children of this stage by reading status from their cached frontmatter
			// We'll build a status-annotated list by reading files
			const stageEntityStatuses: Array<{ status?: string }> = [];

			// Add milestones
			const stageMilestones = milestones.filter(
				m => m.persona === persona.name && m.stage === activeStage
			);
			for (const m of stageMilestones) {
				const cache = app.metadataCache.getFileCache(m.file);
				const status = cache?.frontmatter?.status;
				stageEntityStatuses.push({ status });
			}

			// Add objectives
			const stageObjectives = objectives.filter(
				o => o.persona === persona.name && o.stage === activeStage
			);
			for (const o of stageObjectives) {
				const cache = app.metadataCache.getFileCache(o.file);
				const status = cache?.frontmatter?.status;
				stageEntityStatuses.push({ status });
			}

			// Add quests (already have status in type)
			const stageQuests = quests.filter(
				q => q.persona === persona.name && q.stage === activeStage
			);
			for (const q of stageQuests) {
				stageEntityStatuses.push({ status: q.status });
			}

			// Add duties (already have status in type)
			const stageDuties = duties.filter(
				d => d.persona === persona.name && d.stage === activeStage
			);
			for (const d of stageDuties) {
				stageEntityStatuses.push({ status: d.status });
			}

			stageProgressPct = computeProgressPct(stageEntityStatuses);

			// Find active milestone within this stage
			const activeMilestoneData = stageMilestones.find(m => m.name !== 'Builder' && m.name !== 'Mastery' && m.name !== 'Athlete');
			if (activeMilestoneData) {
				activeMilestone = activeMilestoneData.name;

				// Compute milestone progress similarly
				const milestoneEntityStatuses: Array<{ status?: string }> = [];

				const milestoneObjectives = objectives.filter(
					o => o.persona === persona.name && o.stage === activeStage && o.milestone === activeMilestone
				);
				for (const o of milestoneObjectives) {
					const cache = app.metadataCache.getFileCache(o.file);
					const status = cache?.frontmatter?.status;
					milestoneEntityStatuses.push({ status });
				}

				const milestoneQuests = quests.filter(
					q => q.persona === persona.name && q.stage === activeStage && q.milestone === activeMilestone
				);
				for (const q of milestoneQuests) {
					milestoneEntityStatuses.push({ status: q.status });
				}

				const milestoneDuties = duties.filter(
					d => d.persona === persona.name && d.stage === activeStage && d.milestone === activeMilestone
				);
				for (const d of milestoneDuties) {
					milestoneEntityStatuses.push({ status: d.status });
				}

				milestoneProgressPct = computeProgressPct(milestoneEntityStatuses);
			}
		}

		result.push({
			persona: persona.name,
			activeQuestCount: personaQuests.length,
			activeDutyCount: personaDuties.length,
			activeTaskCount,
			doneTaskCount,
			activeStage,
			stageProgressPct,
			activeMilestone,
			milestoneProgressPct,
			habits
		});
	}

	return result;
}
