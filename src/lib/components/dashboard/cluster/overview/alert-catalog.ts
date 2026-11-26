import { m } from '$lib/messages';

import { SCRAPE_NOISE_ALERT } from './scrape-noise';
import type { FiringAlert } from './signals.svelte';

// Prometheus ALERTS carry labels only, no annotations, so titles and descriptions are written
// here, per alertname, in every locale. Placeholders in the messages are label names. An alert
// not listed falls back to its alertname and the labels that locate it (SPEC 3.3).

type Message = (inputs: Record<string, string>) => string;

const CATALOG: Record<string, [unknown, unknown]> = {
	KubeNodeNotReady: [m.alert_kube_node_not_ready_title, m.alert_kube_node_not_ready_desc],
	KubeNodeUnreachable: [m.alert_kube_node_unreachable_title, m.alert_kube_node_unreachable_desc],
	KubeNodeReadinessFlapping: [
		m.alert_kube_node_readiness_flapping_title,
		m.alert_kube_node_readiness_flapping_desc
	],
	KubeletDown: [m.alert_kubelet_down_title, m.alert_kubelet_down_desc],
	KubeletTooManyPods: [m.alert_kubelet_too_many_pods_title, m.alert_kubelet_too_many_pods_desc],
	NodeFilesystemSpaceFillingUp: [
		m.alert_node_filesystem_space_filling_up_title,
		m.alert_node_filesystem_space_filling_up_desc
	],
	NodeFilesystemAlmostOutOfSpace: [
		m.alert_node_filesystem_almost_out_of_space_title,
		m.alert_node_filesystem_almost_out_of_space_desc
	],
	NodeFilesystemFilesFillingUp: [
		m.alert_node_filesystem_files_filling_up_title,
		m.alert_node_filesystem_files_filling_up_desc
	],
	NodeMemoryHighUtilization: [
		m.alert_node_memory_high_utilization_title,
		m.alert_node_memory_high_utilization_desc
	],
	NodeCPUHighUsage: [m.alert_node_cpu_high_usage_title, m.alert_node_cpu_high_usage_desc],
	NodeClockNotSynchronising: [
		m.alert_node_clock_not_synchronising_title,
		m.alert_node_clock_not_synchronising_desc
	],
	NodeNetworkReceiveErrs: [
		m.alert_node_network_receive_errs_title,
		m.alert_node_network_receive_errs_desc
	],
	NodeRAIDDegraded: [m.alert_node_raid_degraded_title, m.alert_node_raid_degraded_desc],
	KubePodCrashLooping: [m.alert_kube_pod_crash_looping_title, m.alert_kube_pod_crash_looping_desc],
	KubePodNotReady: [m.alert_kube_pod_not_ready_title, m.alert_kube_pod_not_ready_desc],
	KubeContainerWaiting: [m.alert_kube_container_waiting_title, m.alert_kube_container_waiting_desc],
	KubeDeploymentReplicasMismatch: [
		m.alert_kube_deployment_replicas_mismatch_title,
		m.alert_kube_deployment_replicas_mismatch_desc
	],
	KubeDeploymentRolloutStuck: [
		m.alert_kube_deployment_rollout_stuck_title,
		m.alert_kube_deployment_rollout_stuck_desc
	],
	KubeStatefulSetReplicasMismatch: [
		m.alert_kube_stateful_set_replicas_mismatch_title,
		m.alert_kube_stateful_set_replicas_mismatch_desc
	],
	KubeStatefulSetUpdateNotRolledOut: [
		m.alert_kube_stateful_set_update_not_rolled_out_title,
		m.alert_kube_stateful_set_update_not_rolled_out_desc
	],
	KubeDaemonSetRolloutStuck: [
		m.alert_kube_daemon_set_rollout_stuck_title,
		m.alert_kube_daemon_set_rollout_stuck_desc
	],
	KubeDaemonSetNotScheduled: [
		m.alert_kube_daemon_set_not_scheduled_title,
		m.alert_kube_daemon_set_not_scheduled_desc
	],
	KubeDaemonSetMisScheduled: [
		m.alert_kube_daemon_set_mis_scheduled_title,
		m.alert_kube_daemon_set_mis_scheduled_desc
	],
	KubeJobFailed: [m.alert_kube_job_failed_title, m.alert_kube_job_failed_desc],
	KubeJobNotCompleted: [m.alert_kube_job_not_completed_title, m.alert_kube_job_not_completed_desc],
	KubeHpaMaxedOut: [m.alert_kube_hpa_maxed_out_title, m.alert_kube_hpa_maxed_out_desc],
	KubePersistentVolumeFillingUp: [
		m.alert_kube_persistent_volume_filling_up_title,
		m.alert_kube_persistent_volume_filling_up_desc
	],
	KubePersistentVolumeErrors: [
		m.alert_kube_persistent_volume_errors_title,
		m.alert_kube_persistent_volume_errors_desc
	],
	KubeCPUOvercommit: [m.alert_kube_cpu_overcommit_title, m.alert_kube_cpu_overcommit_desc],
	KubeMemoryOvercommit: [m.alert_kube_memory_overcommit_title, m.alert_kube_memory_overcommit_desc],
	KubeQuotaAlmostFull: [m.alert_kube_quota_almost_full_title, m.alert_kube_quota_almost_full_desc],
	KubeQuotaExceeded: [m.alert_kube_quota_exceeded_title, m.alert_kube_quota_exceeded_desc],
	CPUThrottlingHigh: [m.alert_cpu_throttling_high_title, m.alert_cpu_throttling_high_desc],
	KubeAPIDown: [m.alert_kube_api_down_title, m.alert_kube_api_down_desc],
	KubeAPIErrorBudgetBurn: [
		m.alert_kube_api_error_budget_burn_title,
		m.alert_kube_api_error_budget_burn_desc
	],
	KubeClientCertificateExpiration: [
		m.alert_kube_client_certificate_expiration_title,
		m.alert_kube_client_certificate_expiration_desc
	],
	KubeVersionMismatch: [m.alert_kube_version_mismatch_title, m.alert_kube_version_mismatch_desc],
	KubeControllerManagerDown: [
		m.alert_kube_controller_manager_down_title,
		m.alert_kube_controller_manager_down_desc
	],
	KubeSchedulerDown: [m.alert_kube_scheduler_down_title, m.alert_kube_scheduler_down_desc],
	KubeProxyDown: [m.alert_kube_proxy_down_title, m.alert_kube_proxy_down_desc],
	// Not a Prometheus alert: the scrape failures folded together by scrape-noise.ts.
	[SCRAPE_NOISE_ALERT]: [
		m.alert_control_plane_not_scraped_title,
		m.alert_control_plane_not_scraped_desc
	],
	KubeSchedulerInstanceUnreachable: [
		m.alert_kube_scheduler_instance_unreachable_title,
		m.alert_kube_scheduler_instance_unreachable_desc
	],
	KubeControllerManagerInstanceUnreachable: [
		m.alert_kube_controller_manager_instance_unreachable_title,
		m.alert_kube_controller_manager_instance_unreachable_desc
	],
	etcdMembersDown: [m.alert_etcd_members_down_title, m.alert_etcd_members_down_desc],
	etcdInsufficientMembers: [
		m.alert_etcd_insufficient_members_title,
		m.alert_etcd_insufficient_members_desc
	],
	etcdNoLeader: [m.alert_etcd_no_leader_title, m.alert_etcd_no_leader_desc],
	TargetDown: [m.alert_target_down_title, m.alert_target_down_desc],
	AlertmanagerFailedToSendAlerts: [
		m.alert_alertmanager_failed_to_send_alerts_title,
		m.alert_alertmanager_failed_to_send_alerts_desc
	],
	PrometheusRuleFailures: [
		m.alert_prometheus_rule_failures_title,
		m.alert_prometheus_rule_failures_desc
	],
	CephHealthError: [m.alert_ceph_health_error_title, m.alert_ceph_health_error_desc],
	CephHealthWarning: [m.alert_ceph_health_warning_title, m.alert_ceph_health_warning_desc],
	CephOSDDown: [m.alert_ceph_osd_down_title, m.alert_ceph_osd_down_desc],
	CephMonDown: [m.alert_ceph_mon_down_title, m.alert_ceph_mon_down_desc],
	CephClusterNearFull: [m.alert_ceph_cluster_near_full_title, m.alert_ceph_cluster_near_full_desc],
	CephClusterCriticallyFull: [
		m.alert_ceph_cluster_critically_full_title,
		m.alert_ceph_cluster_critically_full_desc
	],
	// Platform rules comparing DCGM with HAMi per card (Analytics SPEC 8). The rule sets `node`,
	// `device` and the GB figures as labels.
	HAMiGPUMemoryUsedBeyondAllocation: [
		m.alert_hami_gpu_memory_used_beyond_allocation_title,
		m.alert_hami_gpu_memory_used_beyond_allocation_desc
	],
	HAMiGPUMemoryOverAllocated: [
		m.alert_hami_gpu_memory_over_allocated_title,
		m.alert_hami_gpu_memory_over_allocated_desc
	]
};

/**
 * The pod an alert is about, if any. An alert whose metric carries no `pod` (KubeJobFailed,
 * KubeQuotaExceeded, …) inherits the scrape target's: the exporter's own pod, which is named
 * after its `service` label. That one says nothing about the problem, so it is dropped.
 */
export function subjectPod(labels: Record<string, string>): string | undefined {
	const { pod, service } = labels;
	if (!pod) return undefined;
	if (service && pod.startsWith(`${service}-`)) return undefined;
	return pod;
}

/** Labels that say where an alert is, in the order a reader looks for them. */
const LOCATING_LABELS = [
	'node',
	'namespace',
	'pod',
	'container',
	'deployment',
	'statefulset',
	'daemonset',
	'job_name',
	'persistentvolumeclaim'
];

/**
 * Where an alert points, as `label value` pairs. Scrape plumbing (`job`, `service`) is left out,
 * and `instance` only stands in when no other label says where the alert is.
 */
export function locatingLabels(labels: Record<string, string>): string {
	const pod = subjectPod(labels);
	const parts = LOCATING_LABELS.filter((key) => (key === 'pod' ? pod : labels[key])).map(
		(key) => `${key} ${labels[key]}`
	);
	if (parts.length === 0 && labels.instance) parts.push(`instance ${labels.instance}`);
	return parts.join(' · ');
}

export function isCatalogued(alertname: string): boolean {
	return Object.hasOwn(CATALOG, alertname);
}

export function describeAlert(alert: FiringAlert): { title: string; description: string } {
	const entry = Object.hasOwn(CATALOG, alert.name) ? CATALOG[alert.name] : undefined;
	if (!entry) {
		return { title: alert.name || '—', description: locatingLabels(alert.labels) };
	}
	// A label the rule did not set reads as a dash rather than "undefined".
	const inputs = new Proxy(alert.labels, {
		get: (labels, key) => (typeof key === 'string' ? (labels[key] ?? '—') : undefined)
	});
	const [title, description] = entry as [Message, Message];
	return { title: title(inputs), description: description(inputs) };
}
