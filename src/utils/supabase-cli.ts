import { FileSystemAdapter, Platform } from 'obsidian';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type MyPlugin from '../../main';

/**
 * Drives the locally-installed `supabase` CLI from Settings (Link / Push /
 * Deploy / Set GitHub Secret buttons) — desktop-only, since it shells out to
 * a process that doesn't exist on mobile. The dashboards themselves never
 * depend on this module; they only ever talk HTTP to Supabase (see
 * `supabase.ts`), so they keep working cross-platform regardless.
 */

export interface CliResult {
	success: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
}

function fail(message: string): Promise<CliResult> {
	return Promise.resolve({ success: false, code: null, stdout: '', stderr: message });
}

export function isDesktop(): boolean {
	return Platform.isDesktopApp;
}

/** Absolute filesystem path to this plugin's folder (where supabase/ lives), or null on a non-standard vault adapter. */
export function getPluginDir(plugin: MyPlugin): string | null {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter) || !plugin.manifest.dir) return null;
	return path.join(adapter.getBasePath(), plugin.manifest.dir);
}

/** Reads supabase/.temp/project-ref (written by `supabase link`) to report current link status. */
export function getLinkedProjectRef(plugin: MyPlugin): string | null {
	const dir = getPluginDir(plugin);
	if (!dir) return null;
	try {
		const ref = fs.readFileSync(path.join(dir, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
		return ref || null;
	} catch {
		return null;
	}
}

export function checkSupabaseCli(): Promise<{ available: boolean; version?: string }> {
	return new Promise((resolve) => {
		const child = spawn('supabase', ['--version'], { shell: true, windowsHide: true });
		let stdout = '';
		child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
		child.on('error', () => resolve({ available: false }));
		child.on('close', (code) => resolve(code === 0 ? { available: true, version: stdout.trim() } : { available: false }));
	});
}

function runCommand(plugin: MyPlugin, args: string[], extraEnv: Record<string, string>): Promise<CliResult> {
	const dir = getPluginDir(plugin);
	if (!dir) return fail('Could not resolve the plugin folder on disk (non-standard vault adapter).');

	return new Promise((resolve) => {
		let stdout = '';
		let stderr = '';
		let settled = false;

		// spawn (not exec) + an args array avoids any shell-quoting concerns
		// for values like the DB password; shell:true is required on Windows
		// so the `supabase.cmd` shim resolves — Node quotes args safely either way.
		const child = spawn('supabase', args, {
			cwd: dir,
			env: { ...process.env, ...extraEnv },
			shell: true,
			windowsHide: true
		});

		const timeout = setTimeout(() => {
			if (!settled) child.kill();
		}, 5 * 60 * 1000);

		child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
		child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

		child.on('error', (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({ success: false, code: null, stdout, stderr: stderr || err.message });
		});

		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({ success: code === 0, code, stdout, stderr });
		});

		// Defensively answer any interactive confirmation prompt a command
		// might still show (e.g. "Do you want to push these migrations? [Y/n]")
		// despite non-interactive flags — harmless no-op if nothing prompts.
		try {
			child.stdin?.write('y\n');
			child.stdin?.end();
		} catch {
			// stdin may already be closed — ignore.
		}
	});
}

export async function linkProject(plugin: MyPlugin): Promise<CliResult> {
	const ref = plugin.settings.supabaseProjectRef.trim();
	const accessToken = plugin.settings.supabaseAccessToken.trim();
	const password = plugin.settings.supabaseDbPassword;

	if (!ref) return fail('Project Ref is required.');
	if (!accessToken) return fail('Supabase Access Token is required.');

	const args = ['link', '--project-ref', ref];
	if (password) args.push('--password', password);

	return runCommand(plugin, args, { SUPABASE_ACCESS_TOKEN: accessToken });
}

export async function pushSchema(plugin: MyPlugin): Promise<CliResult> {
	const accessToken = plugin.settings.supabaseAccessToken.trim();
	const password = plugin.settings.supabaseDbPassword;

	if (!accessToken) return fail('Supabase Access Token is required.');

	const args = ['db', 'push'];
	if (password) args.push('--password', password);

	return runCommand(plugin, args, { SUPABASE_ACCESS_TOKEN: accessToken });
}

export async function deployFunctions(plugin: MyPlugin): Promise<CliResult> {
	const accessToken = plugin.settings.supabaseAccessToken.trim();
	if (!accessToken) return fail('Supabase Access Token is required.');

	return runCommand(plugin, ['functions', 'deploy'], { SUPABASE_ACCESS_TOKEN: accessToken });
}

export async function setGithubSecret(plugin: MyPlugin): Promise<CliResult> {
	const accessToken = plugin.settings.supabaseAccessToken.trim();
	const githubToken = plugin.settings.githubPersonalAccessToken.trim();

	if (!accessToken) return fail('Supabase Access Token is required.');
	if (!githubToken) return fail('GitHub Personal Access Token is required.');

	return runCommand(plugin, ['secrets', 'set', `GITHUB_TOKEN=${githubToken}`], { SUPABASE_ACCESS_TOKEN: accessToken });
}
