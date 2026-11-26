import { q } from '$lib/components/dashboard/cluster/analytics/lib/promql';
import { LIVE_PODS } from '$lib/prometheus';

// PromQL for Workspace Analytics. Every number is asked per pod and added up per workload in the
// browser, so the workload list stays the Resource API's. Builders only, so tests read strings.
// No GPU here: a Workspace page takes GPU numbers from the pods' own annotations and the server's
// shared queries (see lib/data.ts), never from PromQL over the GPU exporters.

/** cAdvisor series of real containers, never the pause sandbox. */
const REAL = 'container!="",container!="POD"';

const spec = (kind: 'requests' | 'limits', resource: 'cpu' | 'memory', ns: string) =>
	`sum by (pod) (kube_pod_container_resource_${kind}{namespace=${ns},resource="${resource}"} ${LIVE_PODS})`;

/** CPU and memory per pod: in use, requested and limit. The same strings feed Now and History. */
export function usageQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	return {
		cpuUse: `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace=${ns},${REAL}}[5m]))`,
		cpuReq: spec('requests', 'cpu', ns),
		cpuLim: spec('limits', 'cpu', ns),
		memUse: `sum by (pod) (container_memory_working_set_bytes{namespace=${ns},${REAL}})`,
		memReq: spec('requests', 'memory', ns),
		memLim: spec('limits', 'memory', ns)
	};
}

/** Restarts per pod over `range`; containers and init containers are separate counters. */
export function restartQueries(namespace: string, range: string): Record<string, string> {
	const ns = q(namespace);
	return {
		restarts: `sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace=${ns}}[${range}]))`,
		initRestarts: `sum by (pod) (increase(kube_pod_init_container_status_restarts_total{namespace=${ns}}[${range}]))`
	};
}

/** What a pod is doing now: where it runs, its phase, readiness and why it waits or last stopped. */
export function podStateQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	return {
		pods: `max by (pod, node) (kube_pod_info{namespace=${ns}})`,
		phase: `max by (pod, phase) (kube_pod_status_phase{namespace=${ns}} == 1)`,
		ready: `max by (pod) (kube_pod_status_ready{namespace=${ns},condition="true"})`,
		waiting: `max by (pod, reason) (kube_pod_container_status_waiting_reason{namespace=${ns}} == 1)`,
		initWaiting: `max by (pod, reason) (kube_pod_init_container_status_waiting_reason{namespace=${ns}} == 1)`,
		lastReason: `max by (pod, reason) (kube_pod_container_status_last_terminated_reason{namespace=${ns}} == 1)`,
		initLastReason: `max by (pod, reason) (kube_pod_init_container_status_last_terminated_reason{namespace=${ns}} == 1)`,
		exitCode: `max by (pod) (kube_pod_container_status_last_terminated_exitcode{namespace=${ns}})`
	};
}

export function quotaQuery(namespace: string): string {
	return `max by (resource) (kube_resourcequota{namespace=${q(namespace)},type="hard"})`;
}

/**
 * Volumes that report usage (those a running pod mounts), their seven-day growth, and the pods
 * that mount them. The growth is kept only for a volume that reports now: `deriv` over seven
 * days also answers for volumes that are gone.
 */
export function volumeQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	const used = `max by (persistentvolumeclaim) (kubelet_volume_stats_used_bytes{namespace=${ns}})`;
	return {
		pvcUsed: used,
		pvcCapacity: `max by (persistentvolumeclaim) (kubelet_volume_stats_capacity_bytes{namespace=${ns}})`,
		pvcGrowth:
			`max by (persistentvolumeclaim) (deriv(kubelet_volume_stats_used_bytes{namespace=${ns}}[7d])) * 86400` +
			` and on (persistentvolumeclaim) ${used}`,
		pvcMounts: `max by (pod, persistentvolumeclaim) (kube_pod_spec_volumes_persistentvolumeclaims_info{namespace=${ns}})`
	};
}

/** Each volume's fill as a percentage of its capacity, for History. */
export function volumeFillQuery(namespace: string): string {
	const ns = q(namespace);
	return (
		`100 * max by (persistentvolumeclaim) (kubelet_volume_stats_used_bytes{namespace=${ns}})` +
		` / max by (persistentvolumeclaim) (kubelet_volume_stats_capacity_bytes{namespace=${ns}})`
	);
}
