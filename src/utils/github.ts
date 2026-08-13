import { requestUrl } from 'obsidian';

export interface GitHubRepoDetails {
	full_name: string;
	description: string | null;
	stargazers_count: number;
	open_issues_count: number;
	forks_count: number;
	html_url: string;
	pushed_at: string;
	latest_release_tag?: string;
	latest_release_url?: string;
	latest_release_date?: string;
	error?: string;
}

export async function fetchGitHubRepoDetails(repoPath: string, token?: string): Promise<GitHubRepoDetails> {
	const cleanRepo = repoPath.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
	const headers: Record<string, string> = {
		'User-Agent': 'Obsidian-My-Assistant-Plugin',
		'Accept': 'application/vnd.github+json'
	};

	if (token) {
		headers['Authorization'] = `token ${token}`;
	}

	try {
		const repoRes = await requestUrl({
			url: `https://api.github.com/repos/${cleanRepo}`,
			headers
		});

		if (repoRes.status !== 200) {
			return {
				full_name: cleanRepo,
				description: null,
				stargazers_count: 0,
				open_issues_count: 0,
				forks_count: 0,
				html_url: `https://github.com/${cleanRepo}`,
				pushed_at: '',
				error: `HTTP ${repoRes.status}`
			};
		}

		const data = repoRes.json;
		const details: GitHubRepoDetails = {
			full_name: data.full_name,
			description: data.description,
			stargazers_count: data.stargazers_count,
			open_issues_count: data.open_issues_count,
			forks_count: data.forks_count,
			html_url: data.html_url,
			pushed_at: data.pushed_at
		};

		// Try fetching latest release
		try {
			const releaseRes = await requestUrl({
				url: `https://api.github.com/repos/${cleanRepo}/releases/latest`,
				headers
			});

			if (releaseRes.status === 200 && releaseRes.json) {
				details.latest_release_tag = releaseRes.json.tag_name;
				details.latest_release_url = releaseRes.json.html_url;
				details.latest_release_date = releaseRes.json.published_at;
			}
		} catch {
			// Releases may not exist for the repo, ignore cleanly
		}

		return details;
	} catch (err: any) {
		return {
			full_name: cleanRepo,
			description: null,
			stargazers_count: 0,
			open_issues_count: 0,
			forks_count: 0,
			html_url: `https://github.com/${cleanRepo}`,
			pushed_at: '',
			error: err?.message || 'Failed to fetch repository details'
		};
	}
}

export async function testGitHubToken(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
	if (!token) {
		return { success: false, error: 'Token is empty.' };
	}
	try {
		const res = await requestUrl({
			url: 'https://api.github.com/user',
			headers: {
				'User-Agent': 'Obsidian-My-Assistant-Plugin',
				'Accept': 'application/vnd.github+json',
				'Authorization': `token ${token}`
			}
		});
		if (res.status === 200 && res.json?.login) {
			return { success: true, username: res.json.login };
		}
		return { success: false, error: `HTTP ${res.status}: Invalid token` };
	} catch (err: any) {
		return { success: false, error: err?.message || 'Failed to authenticate token' };
	}
}

export interface GitHubRepoEvent {
	id: string;
	type: string;
	repoName: string;
	actor: string;
	created_at: string;
	title: string;
	detail?: string;
	url?: string;
}

export async function fetchGitHubRepoEvents(
	repoPath: string,
	sinceIsoDate?: string | null,
	token?: string
): Promise<GitHubRepoEvent[]> {
	const cleanRepo = repoPath.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
	const headers: Record<string, string> = {
		'User-Agent': 'Obsidian-My-Assistant-Plugin',
		'Accept': 'application/vnd.github+json'
	};

	if (token) {
		headers['Authorization'] = `token ${token}`;
	}

	try {
		const res = await requestUrl({
			url: `https://api.github.com/repos/${cleanRepo}/events?per_page=30`,
			headers
		});

		if (res.status !== 200 || !Array.isArray(res.json)) {
			return [];
		}

		const events: GitHubRepoEvent[] = [];
		const sinceTime = sinceIsoDate ? new Date(sinceIsoDate).getTime() : 0;

		for (const raw of res.json) {
			const eventTime = new Date(raw.created_at).getTime();
			// Filter by sinceIsoDate if provided
			if (sinceTime > 0 && eventTime <= sinceTime) {
				continue;
			}

			let title = `${raw.type} by @${raw.actor?.login || 'someone'}`;
			let detail = '';
			let url = `https://github.com/${cleanRepo}`;

			switch (raw.type) {
				case 'WatchEvent':
					title = `⭐ @${raw.actor?.login} starred the repository`;
					break;
				case 'ForkEvent':
					title = `🍴 @${raw.actor?.login} forked the repository`;
					url = raw.payload?.forkee?.html_url || url;
					break;
				case 'IssuesEvent':
					title = `📌 Issue ${raw.payload?.action}: "${raw.payload?.issue?.title || ''}" by @${raw.actor?.login}`;
					url = raw.payload?.issue?.html_url || url;
					break;
				case 'IssueCommentEvent':
					title = `💬 New comment on #${raw.payload?.issue?.number} by @${raw.actor?.login}`;
					detail = raw.payload?.comment?.body ? raw.payload.comment.body.substring(0, 100) + '...' : '';
					url = raw.payload?.comment?.html_url || raw.payload?.issue?.html_url || url;
					break;
				case 'PushEvent':
					const commitCount = raw.payload?.commits?.length || 1;
					const branch = raw.payload?.ref ? raw.payload.ref.replace('refs/heads/', '') : 'main';
					title = `🚀 @${raw.actor?.login} pushed ${commitCount} commit(s) to ${branch}`;
					if (raw.payload?.commits?.[0]?.message) {
						detail = raw.payload.commits[0].message.split('\n')[0];
					}
					break;
				case 'ReleaseEvent':
					title = `🎉 New Release published: ${raw.payload?.release?.tag_name} by @${raw.actor?.login}`;
					url = raw.payload?.release?.html_url || url;
					break;
				case 'CreateEvent':
					title = `✨ Created ${raw.payload?.ref_type} ${raw.payload?.ref || ''} by @${raw.actor?.login}`;
					break;
				case 'PullRequestEvent':
					title = `🔀 Pull Request ${raw.payload?.action}: "${raw.payload?.pull_request?.title || ''}" by @${raw.actor?.login}`;
					url = raw.payload?.pull_request?.html_url || url;
					break;
			}

			events.push({
				id: raw.id,
				type: raw.type,
				repoName: cleanRepo,
				actor: raw.actor?.login || 'unknown',
				created_at: raw.created_at,
				title,
				detail,
				url
			});
		}

		return events;
	} catch {
		return [];
	}
}

