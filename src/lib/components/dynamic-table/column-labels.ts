import { m } from '$lib/messages';

// Column ids are the Kubernetes-facing names (`Up-To-Date`, `Cluster-IP`, …) and are kept
// verbatim in advanced mode. Simple mode reads them through this table instead; an id with
// no entry falls back to itself, so a new column is never left without a header.
const COLUMN_LABELS: Record<string, () => string> = {
	Name: m.column_name,
	Namespace: m.column_namespace,
	Age: m.column_age,
	'Creation Timestamp': m.column_age,
	Ready: m.column_ready,
	Status: m.column_status,
	State: m.column_state,
	Phase: m.column_phase,
	Reason: m.column_reason,
	Message: m.column_message,
	Type: m.column_type,
	Suspend: m.column_suspend,
	Schedule: m.column_schedule,
	'Last Schedule': m.column_last_schedule,
	LastScheduleTime: m.column_last_schedule,
	URL: m.column_url,
	'Model Name': m.column_model_name,
	'Model URI': m.column_model_uri,
	'CPU Request': m.column_cpu_request,
	'CPU Limit': m.column_cpu_limit,
	'Memory Request': m.column_memory_request,
	'Memory Limit': m.column_memory_limit,
	'GPU Memory Limit': m.column_gpu_memory_limit,
	Completions: m.column_completions,
	Available: m.column_available,
	Desired: m.column_desired,
	Current: m.column_current,
	Restarts: m.column_restarts,
	Node: m.column_node,
	IP: m.column_ip,
	Version: m.column_version,
	Duration: m.column_duration,
	Source: m.column_source,
	Repository: m.column_repository,
	'Helm Chart': m.column_helm_chart,
	Ports: m.column_ports,
	'Port(s)': m.column_ports,
	Active: m.column_active,
	Class: m.column_class,
	Mode: m.column_mode,
	'Time Zone': m.column_time_zone,
	Volumes: m.column_volumes
};

// Plumbing that only means something to someone operating Kubernetes itself.
// Simple mode hides these by default; the column menu can still bring any of them back.
const TECHNICAL_COLUMN_IDS = new Set([
	'Namespace',
	'Labels',
	'Annotations',
	'Selector',
	'Pod-Selector',
	'Node Selector',
	'Containers',
	'Images',
	'Up-To-Date',
	'Readiness Gates',
	'Nominated Node',
	'Cluster-IP',
	'External-IP',
	'Ingress Rules',
	'Egress Rules',
	'Interval',
	'Reference',
	'Revision',
	'Listeners',
	'Parent',
	'Templates',
	'Limits'
]);

function getColumnLabel(columnId: string): string {
	return COLUMN_LABELS[columnId]?.() ?? columnId;
}

function isTechnicalColumn(columnId: string): boolean {
	return TECHNICAL_COLUMN_IDS.has(columnId);
}

export { getColumnLabel, isTechnicalColumn };
