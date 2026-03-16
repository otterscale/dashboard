import { error, json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[harbor-proxy] Handling request. Session exists:', !!locals.session);
	if (!locals.session) {
		console.log('[harbor-proxy] Rejecting due to missing session');
		error(403, 'Unauthorized dashboard session');
	}

	try {
		const { url, authorization } = await request.json();

		if (!url) {
			error(400, 'Missing "url" in request body');
		}

		const headers: Record<string, string> = {
			Accept: 'application/json'
		};

		if (authorization) {
			headers['Authorization'] = authorization;
		}

		console.log(`[harbor-proxy] Fetching: ${url}`);

		const response = await fetch(url, { headers });

		if (!response.ok) {
			const text = await response.text();
			console.error(`[harbor-proxy] Error ${response.status}:`, text);
			return new Response(text, { status: response.status });
		}

		const contentType = response.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const data = await response.json();
			return json(data);
		} else {
			const text = await response.text();
			return new Response(text, {
				headers: {
					'Content-Type': contentType
				}
			});
		}
	} catch (err) {
		console.error('[harbor-proxy] Failed to proxy request:', err);
		error(500, 'Failed to proxy Harbor request');
	}
};
