import { requestUrl } from 'obsidian';
import type MyPlugin from '../../main';

/**
 * Thin `requestUrl`-based Supabase client. Deliberately not `@supabase/supabase-js`
 * — see the migration plan for why: this plugin avoids `fetch`/XHR everywhere
 * (for desktop+mobile CORS consistency) and only needs two request shapes
 * (GET a view, POST an Edge Function), so a hand-rolled wrapper in the style
 * of `github.ts`/`unsplash.ts` is lighter than adopting the full JS client.
 */

export function hasSupabaseConfig(plugin: MyPlugin): boolean {
	return !!(plugin.settings.supabaseUrl?.trim() && plugin.settings.supabaseAnonKey?.trim());
}

function baseHeaders(plugin: MyPlugin): Record<string, string> {
	const key = plugin.settings.supabaseAnonKey.trim();
	return {
		'apikey': key,
		'Authorization': `Bearer ${key}`
	};
}

/**
 * Reads from a `v_*` PostgREST view. Fails soft (returns cached rows from
 * the last successful read, or `[]` if there's no cache yet) rather than
 * throwing, since this is used for passive tab-open renders — surfacing a
 * hard error there would be worse UX than briefly-stale data.
 */
export async function supabaseSelect<T>(plugin: MyPlugin, view: string, query?: string): Promise<T[]> {
	if (!hasSupabaseConfig(plugin)) return (plugin.settings.supabaseViewCache?.[view] as T[]) || [];

	const url = `${plugin.settings.supabaseUrl.replace(/\/$/, '')}/rest/v1/${view}${query ? `?${query}` : ''}`;

	try {
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: baseHeaders(plugin),
			throw: false
		});

		if (response.status === 200 && Array.isArray(response.json)) {
			const rows = response.json as T[];
			if (!plugin.settings.supabaseViewCache) plugin.settings.supabaseViewCache = {};
			plugin.settings.supabaseViewCache[view] = rows;
			await plugin.saveSettings();
			return rows;
		}

		console.warn(`My-Assistant: Supabase view read failed for "${view}" (HTTP ${response.status}).`);
	} catch (error) {
		console.warn(`My-Assistant: Supabase view read failed for "${view}".`, error);
	}

	return (plugin.settings.supabaseViewCache?.[view] as T[]) || [];
}

/**
 * Invokes an Edge Function. Unlike `supabaseSelect`, this throws on failure —
 * invokes are always explicit user actions (Refresh, Save) whose caller is
 * expected to catch and surface the error via a `Notice`.
 */
export async function supabaseInvoke<T>(plugin: MyPlugin, fn: string, body: Record<string, unknown> = {}): Promise<T> {
	if (!hasSupabaseConfig(plugin)) {
		throw new Error('Supabase is not configured. Add your Project URL and Anon Key in Settings.');
	}

	const url = `${plugin.settings.supabaseUrl.replace(/\/$/, '')}/functions/v1/${fn}`;

	const response = await requestUrl({
		url,
		method: 'POST',
		headers: {
			...baseHeaders(plugin),
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body),
		throw: false
	});

	if (response.status < 200 || response.status >= 300) {
		const errorMessage = response.json?.error || response.text || `HTTP ${response.status}`;
		throw new Error(errorMessage);
	}

	return response.json as T;
}

/**
 * A round-trip connectivity check for the Settings "Test Connection" button.
 * Unlike `supabaseSelect`, this reports success/failure explicitly instead of
 * failing soft — the whole point here is to surface whether the URL/key work.
 */
export async function testSupabaseConnection(plugin: MyPlugin): Promise<{ success: boolean; error?: string }> {
	if (!hasSupabaseConfig(plugin)) {
		return { success: false, error: 'Project URL and Anon Key are required.' };
	}

	const url = `${plugin.settings.supabaseUrl.replace(/\/$/, '')}/rest/v1/v_tracked_repos?limit=1`;

	try {
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: baseHeaders(plugin),
			throw: false
		});

		if (response.status === 200) return { success: true };
		return { success: false, error: response.json?.message || response.text || `HTTP ${response.status}` };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
	}
}

// ---- View row shapes (snake_case, matching PostgREST JSON directly) ----

export interface TrackedRepoRow {
	id: string;
	repo_full_name: string;
	release_period_days: number | null;
}

export interface RepoLatestRow {
	repo_id: string;
	repo_full_name: string;
	release_period_days: number | null;
	snapshot_date: string;
	description: string | null;
	stargazers_count: number;
	open_issues_count: number;
	forks_count: number;
	html_url: string;
	pushed_at: string | null;
	latest_release_tag: string | null;
	latest_release_url: string | null;
	latest_release_date: string | null;
	fetch_error: string | null;
}

export interface RepoStarHistoryRow {
	repo_full_name: string;
	snapshot_date: string;
	stargazers_count: number;
}

export interface RepoEventRow {
	id: string;
	repo_full_name: string;
	event_type: string;
	actor: string | null;
	created_at: string;
	title: string;
	detail: string | null;
	url: string | null;
}

export interface LichessConfigRow {
	username: string;
}

export interface LichessLatestRow {
	snapshot_date: string;
	username: string;
	title: string | null;
	profile_url: string;
	online: boolean;
	rating_rapid: number | null;
	games_rapid: number | null;
	prog_rapid: number | null;
	prov_rapid: boolean | null;
	fetch_error: string | null;
}

export interface LichessRatingHistoryRow {
	snapshot_date: string;
	rating_rapid: number;
}

// ---- Edge Function invoke response shapes ----

export interface GithubRefreshResponse {
	ok: boolean;
	refreshedAt: string;
	repos: { repo: string; ok: boolean; error?: string }[];
	newEventCount: number;
}

export interface GithubAdminSetReposResponse {
	ok: boolean;
	active: { repo: string; releasePeriodDays?: number }[];
}

export interface GithubAdminTestTokenResponse {
	success: boolean;
	username?: string;
	error?: string;
}

export interface GithubAdminTestRepoResponse {
	success: boolean;
	repo?: { full_name: string; description: string | null; stargazers_count: number };
	error?: string;
}

export interface GithubAdminBackfillStarsResponse {
	ok: boolean;
	repo?: string;
	daysBackfilled?: number;
	totalStars?: number;
	truncated?: boolean;
	error?: string;
}

export interface LichessAdminBackfillResponse {
	ok: boolean;
	daysBackfilled?: number;
	earliestDate?: string;
	latestDate?: string;
	error?: string;
}

export interface LichessRefreshResponse {
	ok: boolean;
	snapshotDate: string;
	rating: number | null;
	error?: string;
}

export interface LichessAdminResponse {
	ok: boolean;
	username: string;
}
