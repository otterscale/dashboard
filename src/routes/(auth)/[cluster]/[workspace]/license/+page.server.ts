import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const cluster = params.cluster;

	try {
		// Try to list License CRs (cluster-scoped)
		const res = await fetch('/otterscale.resource.v1.ResourceService/List', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'licenses'
			})
		});

		if (!res.ok) {
			return { license: null, clusterFingerprint: null };
		}

		const data = (await res.json()) as { items?: Array<{ object?: unknown }> };
		const license = data.items?.[0]?.object ?? null;

		// Try to get ClusterFingerprint
		const cfRes = await fetch('/otterscale.resource.v1.ResourceService/List', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'clusterfingerprints'
			})
		});

		let clusterFingerprint = null;
		if (cfRes.ok) {
			const cfData = (await cfRes.json()) as { items?: Array<{ object?: unknown }> };
			clusterFingerprint = cfData.items?.[0]?.object ?? null;
		}

		return { license, clusterFingerprint };
	} catch (error) {
		console.error('Failed to load license data:', error);
		return { license: null, clusterFingerprint: null };
	}
};
