import { requestUrl } from 'obsidian';
import { UnsplashPhoto } from '../types';

export async function fetchUnsplashPhoto(accessKey: string): Promise<UnsplashPhoto | null> {
	const trimmedKey = accessKey?.trim();
	if (!trimmedKey) {
		return null;
	}

	try {
		const response = await requestUrl({
			url: 'https://api.unsplash.com/photos/random?orientation=landscape&query=nature,landscape,minimal,architecture',
			method: 'GET',
			headers: {
				'Authorization': `Client-ID ${trimmedKey}`,
				'Accept-Version': 'v1'
			}
		});

		if (response.status === 200 && response.json) {
			const data = response.json;
			const imageUrl = data.urls?.regular || data.urls?.full || data.urls?.raw;
			if (imageUrl) {
				return {
					url: imageUrl,
					authorName: data.user?.name || data.user?.username,
					authorUrl: data.user?.links?.html || 'https://unsplash.com'
				};
			}
		}
	} catch (error) {
		console.warn('My-Assistant: Failed to fetch photo from Unsplash.', error);
	}

	return null;
}
