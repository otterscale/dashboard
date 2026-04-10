import { error, json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.session) {
		throw error(403, 'Unauthorized dashboard session');
	}

	try {
		const body = await request.json();

		const { harborHost, apiPath } = body;

		if (!harborHost || !apiPath) {
			throw error(400, 'Missing required fields: harborHost, apiPath');
		}

		const targetUrl = `${harborHost}${apiPath}`;

		const response = await fetch(targetUrl, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${locals.session?.tokenSet.accessToken}`
			}
		});

		if (!response.ok) {
			const text = await response.text();
			console.error(`[harbor-proxy] Fail to proxy to ${harborHost}/${apiPath}`);
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
	} catch (error: any) {
		console.error('[harbor-proxy] Failed to proxy request:', error);
		throw error(500, `Failed to proxy Harbor request: ${error?.message || 'Unknown error'}`);
	}
};
