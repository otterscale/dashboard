/**
 * Whether kube-state-metrics sees the namespace. Without it every quota reads as missing, so the
 * caller shows an error rather than "No quota set".
 *
 * @param namespaceSeries number of `kube_namespace_created{namespace="<ns>"}` series
 * @throws when there is none (not scraped, or the namespace does not exist yet)
 */
export function assertNamespaceSeen(namespaceSeries: number): void {
	if (namespaceSeries === 0) {
		throw new Error('kube-state-metrics has no series for this namespace');
	}
}

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
	assertNamespaceSeen(namespaceSeries);
	return quotaSeries > 0;
}
