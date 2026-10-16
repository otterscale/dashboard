import type { ClusterMetricsAccess } from '$lib/cluster-metrics-access';

/**
 * The attribute the OtterScale server checks before answering cluster-scope
 * PromQL (otterscale internal/core/access.go, ClusterMetricsAccess). Kept
 * identical so the dashboard shows a viewer exactly the pages the server will
 * serve them.
 */
export const CLUSTER_METRICS_ACCESS = {
	verb: 'get',
	group: 'monitoring.coreos.com',
	resource: 'prometheuses',
	subresource: 'api',
	namespace: 'monitoring',
	name: 'prometheus-stack-kube-prom-prometheus'
} as const;

type AccessReviewResponse = { object?: { status?: { allowed?: boolean } } };

/** A failed check is asked once more: a tunnel blip should not hide pages from an admin. */
const ATTEMPTS = 2;

/**
 * Whether the signed-in user may read cluster-scope metrics on `cluster`,
 * asked of that cluster as them (a SelfSubjectAccessReview through the hub).
 *
 * The cluster's answer is final, so a denial is not asked again. A failure
 * (hub or tunnel error, or an unreadable answer) is asked once more and then
 * reads as unknown, which is logged; a denial is not.
 */
export async function checkClusterMetricsAccess(
	svelteFetch: typeof fetch,
	cluster: string
): Promise<ClusterMetricsAccess> {
	const init: RequestInit = {
		method: 'POST',
		headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			cluster,
			group: 'authorization.k8s.io',
			version: 'v1',
			resource: 'selfsubjectaccessreviews',
			manifest: btoa(
				JSON.stringify({
					apiVersion: 'authorization.k8s.io/v1',
					kind: 'SelfSubjectAccessReview',
					spec: { resourceAttributes: CLUSTER_METRICS_ACCESS }
				})
			)
		})
	};

	let failure: unknown;
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		try {
			const response = await svelteFetch('/otterscale.resource.v1.ResourceService/Create', init);
			if (response.ok) {
				const data = (await response.json()) as AccessReviewResponse;
				return data.object?.status?.allowed === true ? 'allowed' : 'denied';
			}
			failure = `HTTP ${response.status}`;
		} catch (error) {
			failure = error;
		}
	}
	console.error(
		`Failed to check cluster metrics access on ${cluster} (${ATTEMPTS} attempts):`,
		failure
	);
	return 'unknown';
}
