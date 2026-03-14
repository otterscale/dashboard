import type { LayoutServerLoad } from './$types';

interface GetResponse {
	object?: {
		spec?: { namespace?: string };
	};
}

export const load: LayoutServerLoad = async ({ params, fetch }) => {
	try {
		const res = await fetch('/otterscale.resource.v1.ResourceService/Get', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cluster: params.cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				name: params.workspace
			})
		});

		if (!res.ok) {
			return { namespace: '' };
		}

		const data = (await res.json()) as GetResponse;
		return { namespace: data.object?.spec?.namespace ?? '' };
	} catch (error) {
		console.error('Failed to resolve workspace namespace:', error);
		return { namespace: '' };
	}
};
