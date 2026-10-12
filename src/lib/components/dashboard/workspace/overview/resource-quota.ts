/**
 * Decide whether a namespace has a ResourceQuota from two series counts.
 *
 * @param namespaceSeries number of `kube_namespace_created{namespace="<ns>"}` series
 * @param quotaSeries number of `kube_resourcequota{namespace="<ns>", type="hard"}` series
 * @returns true when a ResourceQuota exists, false when there is none (usage against ∞)
 * @throws when kube-state-metrics has no series for the namespace (not scraped, or the
 *   namespace does not exist yet), so the caller shows an error instead of a misleading ∞
 */
export function resourceQuotaPresence(namespaceSeries: number, quotaSeries: number): boolean {
	if (namespaceSeries === 0) {
		throw new Error('kube-state-metrics has no series for this namespace');
	}
	return quotaSeries > 0;
}
