import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

import type { PageServerLoad } from './$types';

interface LinkResponse {
	links: { cluster: string }[];
}

async function fetchLinks(fetch: typeof globalThis.fetch) {
	const res = await fetch('/otterscale.link.v1.LinkService/ListLinks', {
		method: 'POST',
		headers: {
			'x-proxy-target': 'api',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({})
	});

	if (!res.ok) return [];

	// Connect's proto3 JSON omits an empty repeated field, so `links` is absent
	// (not []) when no cluster is registered yet.
	const { links } = (await res.json()) as Partial<LinkResponse>;
	return links ?? [];
}

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const links = await fetchLinks(fetch);
		if (links.length === 0) {
			return;
		}

		const cluster = url.searchParams.get('cluster') ?? links[0].cluster;

		if (cluster) {
			redirect(307, resolve('/(auth)/[cluster]/console', { cluster }));
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		console.error('Failed to auto-select cluster/workspace:', e);
	}
};
