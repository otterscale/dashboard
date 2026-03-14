import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

import type { PageServerLoad } from './$types';

interface LinkResponse {
	links: { cluster: string }[];
}

interface WorkspaceItem {
	object?: { metadata?: { name?: string } };
}

interface ListResponse {
	items: WorkspaceItem[];
}

export const load: PageServerLoad = async ({ parent, fetch }) => {
	const { user } = await parent();

	try {
		// Fetch available clusters
		const linkRes = await fetch('/otterscale.link.v1.LinkService/ListLinks', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		if (!linkRes.ok) return;

		const { links } = (await linkRes.json()) as LinkResponse;
		if (links.length === 0) return;

		const cluster = links[0].cluster;

		// Fetch workspaces for the first cluster
		const wsRes = await fetch('/otterscale.resource.v1.ResourceService/List', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				labelSelector: 'user.otterscale.io/' + user.sub
			})
		});

		if (wsRes.ok) {
			const { items } = (await wsRes.json()) as ListResponse;
			const namespace = items[0]?.object?.metadata?.name;
			if (namespace) {
				throw redirect(
					307,
					resolve('/(auth)/[cluster]/[namespace]/overview', { cluster, namespace })
				);
			}
		}

		// Has cluster but no workspace
		throw redirect(307, resolve('/(auth)/[cluster]/overview', { cluster }));
	} catch (e) {
		// Re-throw redirects
		if (e && typeof e === 'object' && 'status' in e) throw e;
		console.error('Failed to auto-select cluster/workspace:', e);
	}
};
