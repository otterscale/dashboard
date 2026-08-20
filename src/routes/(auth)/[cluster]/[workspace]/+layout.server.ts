import type { LayoutServerLoad } from './$types';

interface GetResponse {
	object?: {
		spec?: {
			namespace?: string;
			resourceQuota?: { hard?: Record<string, string> };
		};
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
			return { namespace: '', quotaUnlimited: false };
		}

		const data = (await res.json()) as GetResponse;
		return {
			namespace: data.object?.spec?.namespace ?? '',
			// Same definition the workspace create/update forms use for their "Unlimited" checkbox:
			// no `spec.resourceQuota.hard` means no ResourceQuota is created for the namespace.
			quotaUnlimited: data.object?.spec?.resourceQuota?.hard === undefined
		};
	} catch (error) {
		console.error('Failed to resolve workspace namespace:', error);
		return { namespace: '', quotaUnlimited: false };
	}
};
