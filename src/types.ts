import { TFile } from 'obsidian';

export type EntityKind = 'persona' | 'stage' | 'milestone' | 'objective' | 'quest' | 'duty' | 'task';

export type QuestStatus = 'active' | 'future' | 'completed';

export interface HistorySnapshot {
	date: string;
	value: number;
}

export interface PersonaPluginSettings {
	baseFolder: string;
	maxActiveTasks: number;
	maxActiveQuests: number;
	maxActiveDuties: number;
	unsplashAccessKey: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
	/**
	 * Desktop-only: credentials used to drive the Supabase CLI directly from
	 * Settings (Link / Push / Deploy / Set GitHub Secret buttons). Stored
	 * locally in data.json like the plugin's other secrets (unsplashAccessKey
	 * previously, etc.) — never sent anywhere except as env vars/flags to the
	 * locally-spawned `supabase` process.
	 */
	supabaseAccessToken: string;
	supabaseProjectRef: string;
	supabaseDbPassword: string;
	githubPersonalAccessToken: string;
	/**
	 * Read-through cache of the last successful Supabase view read, keyed by
	 * view name. Purely an offline-safety net so the dashboards don't render
	 * blank if Supabase is briefly unreachable — Supabase remains the source
	 * of truth and this is overwritten on every successful read.
	 */
	supabaseViewCache: Record<string, unknown[]>;
}

export const DEFAULT_SETTINGS: PersonaPluginSettings = {
	baseFolder: 'Life Management',
	maxActiveTasks: 0,
	maxActiveQuests: 0,
	maxActiveDuties: 0,
	unsplashAccessKey: '',
	supabaseUrl: '',
	supabaseAnonKey: '',
	supabaseAccessToken: '',
	supabaseProjectRef: '',
	supabaseDbPassword: '',
	githubPersonalAccessToken: '',
	supabaseViewCache: {}
};

export interface ZenQuote {
	q: string;
	a: string;
	h?: string;
}

export interface UnsplashPhoto {
	url: string;
	authorName?: string;
	authorUrl?: string;
}

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
