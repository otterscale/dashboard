/**
 * Whether the viewer may read cluster-scope metrics on this cluster, as the
 * (auth) layout learns it (src/lib/server/metrics-access.ts).
 *
 * unknown: the question could not be asked. Pages draw what a viewer without
 * access sees — the server would answer the rest 403 or 503 anyway — but say
 * so in a banner, and do not move the viewer elsewhere.
 */
export type ClusterMetricsAccess = 'allowed' | 'denied' | 'unknown';

const NOTICE_PARAM = 'notice';
const CLUSTER_METRICS_NOTICE = 'cluster-metrics';

/**
 * Where a cluster-wide dashboard (Cluster, Storage) sends the viewer, or null
 * to let them stay. Only a denial leaves: on unknown it was the check that
 * failed, not the viewer, and a redirect would only lose an admin's bookmark.
 * The overview reads the notice and says why the viewer landed there.
 */
export function clusterDashboardRedirect(
	access: ClusterMetricsAccess,
	overviewPath: string
): string | null {
	return access === 'denied' ? `${overviewPath}?${NOTICE_PARAM}=${CLUSTER_METRICS_NOTICE}` : null;
}

/** `url` without the redirect notice, or null when it carries none. `url` is not changed. */
export function withoutClusterMetricsNotice(url: URL): URL | null {
	if (url.searchParams.get(NOTICE_PARAM) !== CLUSTER_METRICS_NOTICE) return null;
	const cleaned = new URL(url);
	cleaned.searchParams.delete(NOTICE_PARAM);
	return cleaned;
}
