import { escapePromqlStringLiteral } from '$lib/prometheus';

// PromQL the overview cards and Analytics both ask, so the two tabs give the same number for the
// same thing. Builders only; each caller adds its own aggregation (`sum(...)`, `sum by (pod)`).

/** `namespace="<ns>"`, escaped, for a selector. */
export const inNamespace = (namespace: string) =>
	`namespace="${escapePromqlStringLiteral(namespace)}"`;

/** cAdvisor series of real containers, never the pause sandbox. */
const REAL = 'container!="", container!="POD"';

/** CPU in use per container, in cores. */
export function cpuUsage(namespace: string): string {
	return `rate(container_cpu_usage_seconds_total{${inNamespace(namespace)}, ${REAL}}[5m])`;
}

/** Memory in use per container, in bytes. */
export function memoryUsage(namespace: string): string {
	return `container_memory_working_set_bytes{${inNamespace(namespace)}, ${REAL}}`;
}

/**
 * Only mounted volumes report usage, and a volume whose pod restarts drops out between scrapes,
 * so each claim keeps its last reading from the past 5 minutes. Claims that no longer exist are
 * left out.
 */
function perClaim(metric: string, namespace: string): string {
	const ns = inNamespace(namespace);
	return `max by (persistentvolumeclaim) (last_over_time(${metric}{${ns}}[5m])) and on (persistentvolumeclaim) kube_persistentvolumeclaim_info{${ns}}`;
}

/** Bytes used per claim. */
export function pvcUsed(namespace: string): string {
	return perClaim('kubelet_volume_stats_used_bytes', namespace);
}

/** Bytes of capacity per claim. */
export function pvcCapacity(namespace: string): string {
	return perClaim('kubelet_volume_stats_capacity_bytes', namespace);
}

/**
 * Growth per day over the week, kept only for a volume that reports usage now: `deriv` over
 * seven days also answers for volumes that are gone.
 */
export function pvcGrowthPerDay(namespace: string): string {
	return `max by (persistentvolumeclaim) (deriv(kubelet_volume_stats_used_bytes{${inNamespace(namespace)}}[7d])) * 86400 and on (persistentvolumeclaim) (${pvcUsed(namespace)})`;
}
