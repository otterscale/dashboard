import { error, json, type RequestHandler } from '@sveltejs/kit';
import { load } from 'js-yaml';

import type { ChartType } from '$lib/components/artifact-viewer/types';

function getIndexUrl(repositoryUrl: string): URL {
	const url = new URL(repositoryUrl);
	if (url.pathname.endsWith('/index.yaml') || url.pathname.endsWith('/index.yml')) {
		return url;
	}
	if (!url.pathname.endsWith('/')) {
		url.pathname = `${url.pathname}/`;
	}
	return new URL('index.yaml', url);
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.session) {
		throw error(403, 'Unauthorized dashboard session');
	}

	try {
		const body = await request.json();
		const { repositoryUrl } = body as {
			repositoryUrl?: string;
		};

		if (!repositoryUrl) {
			throw error(400, 'Missing required fields: repositoryUrl');
		}

		const indexUrl = getIndexUrl(repositoryUrl);
		const response = await fetch(indexUrl, {
			headers: {
				Accept: 'application/yaml, application/x-yaml, text/yaml, text/plain, */*'
			}
		});

		if (!response.ok) {
			const text = await response.text();
			return new Response(text, { status: response.status });
		}

		const document = load(await response.text()) as {
			entries?: Record<string, ChartType[]>;
		};

		return json(document?.entries);
	} catch (err) {
		console.error('[helm-repository-index] Failed to fetch repository index:', err);
		const status = (err as { status?: number })?.status ?? 500;
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(status, `Failed to fetch Helm repository index: ${message}`);
	}
};
