import { App } from 'obsidian';
import { DutyItem, MilestoneItem, ObjectiveItem, PersonaItem, QuestItem, QuestStatus, StageItem } from '../types';

export function getPersonas(app: App): PersonaItem[] {
	const files = app.vault.getMarkdownFiles();
	const personas: PersonaItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'persona') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.persona || file.basename;
			personas.push({
				name,
				file,
				path: file.path
			});
		}
	}

	return personas.sort((a, b) => a.name.localeCompare(b.name));
}

export function getStages(app: App): StageItem[] {
	const files = app.vault.getMarkdownFiles();
	const stages: StageItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'stage') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.stage || file.basename;
			const persona = frontmatter.persona || '';
			stages.push({
				name,
				persona,
				file,
				path: file.path
			});
		}
	}

	return stages.sort((a, b) => a.name.localeCompare(b.name));
}

export function getMilestones(app: App): MilestoneItem[] {
	const files = app.vault.getMarkdownFiles();
	const milestones: MilestoneItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'milestone') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.milestone || file.basename;
			const stage = frontmatter.stage || '';
			const persona = frontmatter.persona || '';
			milestones.push({
				name,
				stage,
				persona,
				file,
				path: file.path
			});
		}
	}

	return milestones.sort((a, b) => a.name.localeCompare(b.name));
}

export function getObjectives(app: App): ObjectiveItem[] {
	const files = app.vault.getMarkdownFiles();
	const objectives: ObjectiveItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'objective') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.objective || file.basename;
			const milestone = frontmatter.milestone || '';
			const stage = frontmatter.stage || '';
			const persona = frontmatter.persona || '';
			objectives.push({
				name,
				milestone,
				stage,
				persona,
				file,
				path: file.path
			});
		}
	}

	return objectives.sort((a, b) => a.name.localeCompare(b.name));
}

export function getQuests(app: App): QuestItem[] {
	const files = app.vault.getMarkdownFiles();
	const quests: QuestItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'quest') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.quest || file.basename;
			const objective = frontmatter.objective || '';
			const milestone = frontmatter.milestone || '';
			const stage = frontmatter.stage || '';
			const persona = frontmatter.persona || '';
			const qStatus = (frontmatter.status as QuestStatus) || 'active';
			quests.push({
				name,
				objective,
				milestone,
				stage,
				persona,
				status: qStatus,
				file,
				path: file.path
			});
		}
	}

	return quests.sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveTaskCount(app: App): number {
	const files = app.vault.getMarkdownFiles();
	let count = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'task') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'done' && status !== 'completed' && status !== 'future') {
				count++;
			}
		}
	}

	return count;
}

export function getActiveQuestCount(app: App): number {
	const files = app.vault.getMarkdownFiles();
	let count = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'quest') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status === 'active') {
				count++;
			}
		}
	}

	return count;
}

export function getDuties(app: App): DutyItem[] {
	const files = app.vault.getMarkdownFiles();
	const duties: DutyItem[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'duty') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status !== 'active') continue;

			const name = frontmatter.duty || file.basename;
			const objective = frontmatter.objective || '';
			const milestone = frontmatter.milestone || '';
			const stage = frontmatter.stage || '';
			const persona = frontmatter.persona || '';
			const dStatus = (frontmatter.status as QuestStatus) || 'active';
			duties.push({
				name,
				objective,
				milestone,
				stage,
				persona,
				status: dStatus,
				file,
				path: file.path
			});
		}
	}

	return duties.sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveDutyCount(app: App): number {
	const files = app.vault.getMarkdownFiles();
	let count = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;

		const kind = String(frontmatter.kind || '').toLowerCase();
		if (kind === 'duty') {
			const status = String(frontmatter.status || 'active').toLowerCase();
			if (status === 'active') {
				count++;
			}
		}
	}

	return count;
}


