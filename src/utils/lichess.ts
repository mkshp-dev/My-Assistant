import { requestUrl } from 'obsidian';

export interface LichessPerf {
	games: number;
	rating: number;
	rd: number;
	prog: number;
	prov?: boolean;
}

export interface LichessUserData {
	username: string;
	title?: string;
	url: string;
	online: boolean;
	perfs: {
		blitz?: LichessPerf;
		bullet?: LichessPerf;
		rapid?: LichessPerf;
		classical?: LichessPerf;
		puzzle?: LichessPerf;
	};
	error?: string;
}

export async function fetchLichessUserData(username: string): Promise<LichessUserData> {
	const cleanUser = username.trim();
	try {
		const res = await requestUrl({
			url: `https://lichess.org/api/user/${cleanUser}`,
			headers: {
				'User-Agent': 'Obsidian-My-Assistant-Plugin',
				'Accept': 'application/json'
			}
		});

		if (res.status !== 200) {
			return {
				username: cleanUser,
				url: `https://lichess.org/@/${cleanUser}`,
				online: false,
				perfs: {},
				error: `HTTP ${res.status}`
			};
		}

		const data = res.json;
		return {
			username: data.username || cleanUser,
			title: data.title,
			url: data.url || `https://lichess.org/@/${cleanUser}`,
			online: !!data.online,
			perfs: data.perfs || {}
		};
	} catch (err: any) {
		return {
			username: cleanUser,
			url: `https://lichess.org/@/${cleanUser}`,
			online: false,
			perfs: {},
			error: err?.message || 'Failed to fetch Lichess data'
		};
	}
}
