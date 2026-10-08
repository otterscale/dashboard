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

/**
 * Whether the signed-in user may read cluster-scope metrics on `cluster`,
 * asked of that cluster as them (a SelfSubjectAccessReview through the hub).
 * Any failure reads as "no": the page then shows the namespace view, which
 * the server serves to cluster viewers too, so nothing breaks for them.
 */
export async function canViewClusterMetrics(
	svelteFetch: typeof fetch,
	cluster: string
): Promise<boolean> {
	try {
		const response = await svelteFetch('/otterscale.resource.v1.ResourceService/Create', {
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
		});
		if (!response.ok) return false;
		const data = (await response.json()) as AccessReviewResponse;
		return data.object?.status?.allowed === true;
	} catch (error) {
		console.error('Failed to check cluster metrics access:', error);
		return false;
	}
}
