import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

import type { PageServerLoad } from './$types';

interface WorkspaceItem {
	object?: { metadata?: { name?: string } };
}

interface ListResponse {
	items: WorkspaceItem[];
}

async function fetchFirstWorkspace(fetch: typeof globalThis.fetch, cluster: string, sub: string) {
	const res = await fetch('/otterscale.resource.v1.ResourceService/List', {
		method: 'POST',
		headers: {
			'x-proxy-target': 'api',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			cluster,
			group: 'tenant.otterscale.io',
			version: 'v1alpha1',
			resource: 'workspaces',
			labelSelector: `user.otterscale.io/${sub}`
		})
	});

	if (!res.ok) return undefined;

	const { items } = (await res.json()) as ListResponse;
	return items[0]?.object?.metadata?.name;
}

export const load: PageServerLoad = async ({ parent, fetch, params }) => {
	const { user } = await parent();
	const { cluster } = params;

	let workspace: string | undefined;

	try {
		workspace = await fetchFirstWorkspace(fetch, cluster, user.sub);
	} catch (e) {
		console.error('Failed to fetch workspace:', e);
	}

	if (workspace) {
		redirect(307, resolve('/(auth)/[cluster]/[workspace]/overview', { cluster, workspace }));
	}
};
