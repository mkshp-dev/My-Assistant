import { App, normalizePath, TFile } from 'obsidian';
import { DutyItem, MilestoneItem, ObjectiveItem, PersonaItem, PersonaPluginSettings, QuestItem, QuestStatus, StageItem } from '../types';
import { getActiveDutyCount, getActiveQuestCount, getActiveTaskCount } from './vault-scanner';

export async function ensureFolderExists(app: App, path: string): Promise<void> {
	const normalizedPath = normalizePath(path.replace(/\\/g, '/')).trim();
	if (!normalizedPath || normalizedPath === '.') return;

	const parts = normalizedPath.split('/').filter(p => p.length > 0);
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			await app.vault.createFolder(currentPath);
		}
	}
}

function getParentFolderPath(file: TFile): string {
	if (file.parent && file.parent.path && file.parent.path !== '/') {
		return file.parent.path;
	}
	return '';
}

export async function createPersona(app: App, baseFolder: string, name: string): Promise<TFile> {
	const sanitizedName = name.trim();
	const baseDir = baseFolder.trim();
	const personaDir = baseDir ? `${baseDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, personaDir);

	const filePath = normalizePath(`${personaDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: persona
persona: ${sanitizedName}
status: active
---

# ${sanitizedName}
`;

	const file = await app.vault.create(filePath, content);

	// Create required vision.md and principles.md stubs if they don't exist
	const visionPath = normalizePath(`${personaDir}/vision.md`);
	if (!app.vault.getAbstractFileByPath(visionPath)) {
		await app.vault.create(visionPath, `# Vision\n\nWrite 3-4 sentences describing the vision for this persona.\n`);
	}

	const principlesPath = normalizePath(`${personaDir}/principles.md`);
	if (!app.vault.getAbstractFileByPath(principlesPath)) {
		await app.vault.create(principlesPath, `# Principles\n\n- Principle 1\n- Principle 2\n- Principle 3\n- Principle 4\n`);
	}

	return file;
}

export async function createStage(app: App, personaItem: PersonaItem, name: string): Promise<TFile> {
	const sanitizedName = name.trim();
	const personaDir = getParentFolderPath(personaItem.file);
	const stageDir = personaDir ? `${personaDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, stageDir);

	const filePath = normalizePath(`${stageDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: stage
persona: ${personaItem.name}
stage: ${sanitizedName}
status: active
---

# ${sanitizedName}
`;

	return await app.vault.create(filePath, content);
}

export async function createMilestone(app: App, stageItem: StageItem, name: string): Promise<TFile> {
	const sanitizedName = name.trim();
	const stageDir = getParentFolderPath(stageItem.file);
	const milestoneDir = stageDir ? `${stageDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, milestoneDir);

	const filePath = normalizePath(`${milestoneDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: milestone
persona: ${stageItem.persona}
stage: ${stageItem.name}
milestone: ${sanitizedName}
status: active
---

# ${sanitizedName}
`;

	return await app.vault.create(filePath, content);
}

export async function createObjective(app: App, milestoneItem: MilestoneItem, name: string): Promise<TFile> {
	const sanitizedName = name.trim();
	const milestoneDir = getParentFolderPath(milestoneItem.file);
	const objectiveDir = milestoneDir ? `${milestoneDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, objectiveDir);

	const filePath = normalizePath(`${objectiveDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: objective
persona: ${milestoneItem.persona}
stage: ${milestoneItem.stage}
milestone: ${milestoneItem.name}
objective: ${sanitizedName}
status: active
---

# ${sanitizedName}
`;

	return await app.vault.create(filePath, content);
}

export async function createQuest(app: App, objectiveItem: ObjectiveItem, name: string, status: QuestStatus, settings?: PersonaPluginSettings): Promise<TFile> {
	if (status === 'active' && settings && settings.maxActiveQuests > 0) {
		const currentActive = getActiveQuestCount(app);
		if (currentActive >= settings.maxActiveQuests) {
			throw new Error(`Maximum allowed active quests limit (${settings.maxActiveQuests}) reached.`);
		}
	}

	const sanitizedName = name.trim();
	const objectiveDir = getParentFolderPath(objectiveItem.file);
	const questDir = objectiveDir ? `${objectiveDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, questDir);

	const filePath = normalizePath(`${questDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: quest
persona: ${objectiveItem.persona}
stage: ${objectiveItem.stage}
milestone: ${objectiveItem.milestone}
objective: ${objectiveItem.name}
status: ${status}
---

# ${sanitizedName}
`;

	return await app.vault.create(filePath, content);
}

export async function createDuty(app: App, objectiveItem: ObjectiveItem, name: string, status: QuestStatus, settings?: PersonaPluginSettings): Promise<TFile> {
	if (status === 'active' && settings && settings.maxActiveDuties > 0) {
		const currentActive = getActiveDutyCount(app);
		if (currentActive >= settings.maxActiveDuties) {
			throw new Error(`Maximum allowed active duties limit (${settings.maxActiveDuties}) reached.`);
		}
	}

	const sanitizedName = name.trim();
	const objectiveDir = getParentFolderPath(objectiveItem.file);
	const dutyDir = objectiveDir ? `${objectiveDir}/${sanitizedName}` : sanitizedName;

	await ensureFolderExists(app, dutyDir);

	const filePath = normalizePath(`${dutyDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const content = `---
kind: duty
persona: ${objectiveItem.persona}
stage: ${objectiveItem.stage}
milestone: ${objectiveItem.milestone}
objective: ${objectiveItem.name}
status: ${status}
---

# Duty: ${sanitizedName}
`;

	return await app.vault.create(filePath, content);
}

export async function createTask(app: App, parentItem: QuestItem | DutyItem, name: string, settings?: PersonaPluginSettings, parentType: 'quest' | 'duty' = 'quest'): Promise<TFile> {
	if (settings && settings.maxActiveTasks > 0) {
		const currentActive = getActiveTaskCount(app);
		if (currentActive >= settings.maxActiveTasks) {
			throw new Error(`Maximum allowed active tasks limit (${settings.maxActiveTasks}) reached.`);
		}
	}

	const sanitizedName = name.trim();
	const parentDir = getParentFolderPath(parentItem.file);

	await ensureFolderExists(app, parentDir);

	const filePath = normalizePath(`${parentDir}/${sanitizedName}.md`);
	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		throw new Error(`File already exists: ${filePath}`);
	}

	const parentKey = parentType === 'duty' ? 'duty' : 'quest';
	const content = `---
${parentKey}: ${parentItem.name}
persona: ${parentItem.persona}
stage: ${parentItem.stage}
milestone: ${parentItem.milestone}
objective: ${parentItem.objective}
kind: task
status: active
---
`;

	return await app.vault.create(filePath, content);
}
