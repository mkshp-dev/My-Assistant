import { requestUrl } from 'obsidian';
import { ZenQuote } from '../types';

const FALLBACK_QUOTES: ZenQuote[] = [
	{ q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
	{ q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
	{ q: "Act as if what you do makes a difference. It does.", a: "William James" },
	{ q: "Quality is not an act, it is a habit.", a: "Aristotle" },
	{ q: "Simplicity is the ultimate sophistication.", a: "Leonardo da Vinci" },
	{ q: "What we achieve inwardly will change outer reality.", a: "Plutarch" },
	{ q: "Do what you can, with what you have, where you are.", a: "Theodore Roosevelt" }
];

export async function fetchZenQuote(mode: 'today' | 'random' = 'today'): Promise<ZenQuote> {
	const url = mode === 'today' 
		? 'https://zenquotes.io/api/today' 
		: 'https://zenquotes.io/api/random';

	try {
		const response = await requestUrl({
			url: url,
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});

		if (response.status === 200 && response.json) {
			const data = response.json;
			if (Array.isArray(data) && data.length > 0 && data[0].q && data[0].a) {
				return {
					q: data[0].q,
					a: data[0].a,
					h: data[0].h
				};
			}
		}
	} catch (error) {
		console.warn('My-Assistant: Failed to fetch quote from ZenQuotes, using fallback quote.', error);
	}

	// Pick a deterministic or random fallback quote
	const randomIndex = Math.floor(Math.random() * FALLBACK_QUOTES.length);
	return FALLBACK_QUOTES[randomIndex];
}
