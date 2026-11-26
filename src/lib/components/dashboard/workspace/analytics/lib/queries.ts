import { q } from '$lib/components/dashboard/cluster/analytics/lib/promql';
import { LIVE_PODS } from '$lib/prometheus';

import { cpuUsage, memoryUsage, pvcCapacity, pvcGrowthPerDay, pvcUsed } from '../../lib/queries';

// PromQL for Workspace Analytics. Every number is asked per pod and added up per workload in the
// browser, so the workload list stays the Resource API's. Builders only, so tests read strings.
// No GPU here: a Workspace page takes GPU numbers from the pods' own annotations and the server's
// shared queries (see lib/data.ts), never from PromQL over the GPU exporters.

const spec = (kind: 'requests' | 'limits', resource: 'cpu' | 'memory', ns: string) =>
	`sum by (pod) (kube_pod_container_resource_${kind}{namespace=${ns},resource="${resource}"} ${LIVE_PODS})`;

/**
 * CPU and memory per pod: in use, requested and limit. The same strings feed Now and History, and
 * usage is read the way the overview's quota card reads it.
 */
export function usageQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	return {
		cpuUse: `sum by (pod) (${cpuUsage(namespace)})`,
		cpuReq: spec('requests', 'cpu', ns),
		cpuLim: spec('limits', 'cpu', ns),
		memUse: `sum by (pod) (${memoryUsage(namespace)})`,
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
 * that mount them, read the way the overview's Storage card reads them.
 */
export function volumeQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	return {
		pvcUsed: pvcUsed(namespace),
		pvcCapacity: pvcCapacity(namespace),
		pvcGrowth: pvcGrowthPerDay(namespace),
		pvcMounts: `max by (pod, persistentvolumeclaim) (kube_pod_spec_volumes_persistentvolumeclaims_info{namespace=${ns}})`
	};
}

/** Each volume's fill as a percentage of its capacity, for History. */
export function volumeFillQuery(namespace: string): string {
	return `100 * (${pvcUsed(namespace)}) / (${pvcCapacity(namespace)})`;
}
