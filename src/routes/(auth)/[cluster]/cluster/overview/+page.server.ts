import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

import type { PageServerLoad } from './$types';

interface WorkspaceItem {
	object?: { metadata?: { name?: string } };
}

interface ListResponse {
	items: WorkspaceItem[];
}

export const load: PageServerLoad = async ({ params, parent, fetch }) => {
	const cluster = params.cluster;
	if (!cluster) return;

	const { user } = await parent();

	try {
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
			const workspace = items[0]?.object?.metadata?.name;
			if (workspace) {
				throw redirect(
					307,
					resolve('/(auth)/[cluster]/[workspace]/overview/cluster', { cluster, workspace })
				);
			}
		}

		throw redirect(307, resolve('/(auth)/[cluster]/overview', { cluster }));
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw redirect(307, resolve('/(auth)/[cluster]/overview', { cluster }));
	}
};
