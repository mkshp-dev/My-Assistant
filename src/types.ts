import { TFile } from 'obsidian';

export type EntityKind = 'persona' | 'stage' | 'milestone' | 'objective' | 'quest' | 'duty' | 'task';

export type QuestStatus = 'active' | 'future' | 'completed';

export interface PersonaPluginSettings {
	baseFolder: string;
	maxActiveTasks: number;
	maxActiveQuests: number;
	maxActiveDuties: number;
}

export const DEFAULT_SETTINGS: PersonaPluginSettings = {
	baseFolder: 'Life Management',
	maxActiveTasks: 0,
	maxActiveQuests: 0,
	maxActiveDuties: 0
};

export interface PersonaItem {
	name: string;
	file: TFile;
	path: string;
}

export interface StageItem {
	name: string;
	persona: string;
	file: TFile;
	path: string;
}

export interface MilestoneItem {
	name: string;
	persona: string;
	stage: string;
	file: TFile;
	path: string;
}

export interface ObjectiveItem {
	name: string;
	persona: string;
	stage: string;
	milestone: string;
	file: TFile;
	path: string;
}

export interface QuestItem {
	name: string;
	persona: string;
	stage: string;
	milestone: string;
	objective: string;
	status: QuestStatus;
	file: TFile;
	path: string;
}

export interface DutyItem {
	name: string;
	persona: string;
	stage: string;
	milestone: string;
	objective: string;
	status: QuestStatus;
	file: TFile;
	path: string;
}
