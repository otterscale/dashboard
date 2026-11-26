import type { FiringAlert } from './signals.svelte';

// The cluster dashboard is for whoever runs the cluster, so Needs attention lists only problems
// with the cluster itself: nodes, the control plane, capacity, storage and the monitoring stack.
// A failed job or a crashing pod is the owning workspace's business and is left out wherever it
// runs. Info alerts are left out too: they never make the cluster Degraded, so they only add rows.

/**
 * kube-prometheus-stack's workload rules (kubernetes-apps, kubernetes-resources quota,
 * kubernetes-storage PVC). They fire per pod, workload, quota or claim, never for the cluster.
 * Alerts not named here, such as Rook's Ceph rules, count as cluster level.
 */
const WORKLOAD_ALERTS = new Set([
	'KubePodCrashLooping',
	'KubePodNotReady',
	'KubeContainerWaiting',
	'KubeDeploymentGenerationMismatch',
	'KubeDeploymentReplicasMismatch',
	'KubeDeploymentRolloutStuck',
	'KubeStatefulSetReplicasMismatch',
	'KubeStatefulSetGenerationMismatch',
	'KubeStatefulSetUpdateNotRolledOut',
	'KubeDaemonSetRolloutStuck',
	'KubeDaemonSetNotScheduled',
	'KubeDaemonSetMisScheduled',
	'KubeJobNotCompleted',
	'KubeJobFailed',
	'KubeHpaReplicasMismatch',
	'KubeHpaMaxedOut',
	'KubeQuotaAlmostFull',
	'KubeQuotaFullyUsed',
	'KubeQuotaExceeded',
	'CPUThrottlingHigh',
	'KubePersistentVolumeFillingUp',
	'KubePersistentVolumeInodesFillingUp'
]);

/**
 * TargetDown fires for any scrape target, a workspace's own ServiceMonitor included. Only the
 * monitoring stack's targets (kube-state-metrics, node-exporter, kubelet, Prometheus itself) are
 * the cluster's; they live in these two namespaces.
 */
const MONITORING_NAMESPACES = new Set(['kube-system', 'monitoring']);

export function isClusterLevel(alert: FiringAlert): boolean {
	if (WORKLOAD_ALERTS.has(alert.name)) return false;
	if (alert.name === 'TargetDown') return MONITORING_NAMESPACES.has(alert.labels.namespace ?? '');
	return true;
}

/** Only critical and warning: the severities that make the cluster Degraded. */
export function needsAction(alert: FiringAlert): boolean {
	return alert.severity === 'critical' || alert.severity === 'warning';
}

/** The alerts the cluster dashboard shows and counts. */
export function clusterAlerts(alerts: FiringAlert[]): FiringAlert[] {
	return alerts.filter((alert) => isClusterLevel(alert) && needsAction(alert));
}
