import type { InstantVector, PrometheusDriver } from 'prometheus-query';

import { ReloadManager } from '$lib/components/custom/reloader';
import { fetchCombinedInstantOrNull } from '$lib/prometheus';

import { clusterAlerts } from './alert-scope';
import { CONTROL_PLANE_PODS_QUERY, foldScrapeNoise } from './scrape-noise';

// Facts several cards of the overview depend on: which nodes exist and are Ready, their roles,
// and the alerts firing. Fetched once per reload as one request and shared, so the state card,
// the capacity scopes and the node table can never disagree about which node is down.

/** kube-prometheus-stack's Watchdog always fires, and InfoInhibitor only mutes info alerts. */
const ALERT_SELECTOR = '{alertstate="firing", alertname!~"Watchdog|InfoInhibitor"}';

/**
 * Nodes whose Ready condition is true, as a `node`-labelled vector of 1. `max by` collapses the
 * duplicate series a second kube-state-metrics scrape would add. Append to a per-node
 * expression with `and on (node)` to keep Ready nodes only.
 */
export const READY_NODES =
	'(max by (node) (kube_node_status_condition{condition="Ready", status="true"}) == 1)';

const QUERIES = {
	// Every node kube-state-metrics knows, Ready or not; the value is 1 when Ready.
	ready: 'max by (node) (kube_node_status_condition{condition="Ready", status="true"})',
	nodes: 'max by (node) (kube_node_info)',
	// RKE2 masters carry node-role.kubernetes.io/{control-plane,etcd,master}.
	roles: 'max by (node, role) (kube_node_role)',
	// Schedulable GPUs as the device plugin advertises them. With HAMi this is cards ×
	// `deviceSplitCount`, so it only tells *whether* a node has GPUs, never how many.
	gpu: 'max by (node) (kube_node_status_allocatable{resource="nvidia_com_gpu"}) > 0',
	alerts: `ALERTS${ALERT_SELECTOR}`,
	// The value is the Unix time the alert became active. Same labels as ALERTS, less alertstate.
	alertsSince: 'ALERTS_FOR_STATE{alertname!~"Watchdog|InfoInhibitor"}',
	build: 'kubernetes_build_info{job="apiserver"}',
	// Readiness of the control-plane static pods, to tell a failed scrape from a failed component.
	controlPods: CONTROL_PLANE_PODS_QUERY
};

export type NodeSignal = {
	name: string;
	ready: boolean;
	/** `control-plane`, `etcd`, `master`, … from the node-role labels. */
	roles: string[];
	isMaster: boolean;
	hasGpu: boolean;
};

export type FiringAlert = {
	name: string;
	severity: string;
	labels: Record<string, string>;
	/** Unix seconds; undefined when ALERTS_FOR_STATE has no matching series. */
	activeAt?: number;
};

export type SignalsStatus = 'loading' | 'error' | 'empty' | 'ready';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function severityRank(severity: string): number {
	return SEVERITY_ORDER[severity] ?? 3;
}

/** Identity of an alert across ALERTS and ALERTS_FOR_STATE: its labels without alertstate. */
export function alertKey(labels: Record<string, string>): string {
	return Object.keys(labels)
		.filter((key) => key !== 'alertstate' && key !== '__name__')
		.sort()
		.map((key) => `${key}=${labels[key]}`)
		.join(',');
}

function labelsOf(series: InstantVector): Record<string, string> {
	return series.metric.labels as Record<string, string>;
}

export class ClusterSignals {
	status = $state<SignalsStatus>('loading');
	// Replaced whole by each refresh, never changed in place.
	nodes = $state.raw<NodeSignal[]>([]);
	alerts = $state.raw<FiringAlert[]>([]);
	kubernetesVersion = $state<string>();
	kubernetesPlatform = $state<string>();
	/** When the last request succeeded, in ms. */
	updatedAt = $state<number>();

	readonly readyCount = $derived(this.nodes.filter((node) => node.ready).length);
	readonly allReady = $derived(this.nodes.length > 0 && this.readyCount === this.nodes.length);
	readonly masterCount = $derived(this.nodes.filter((node) => node.isMaster).length);
	/** Any alert makes the cluster Degraded: `alerts` holds only critical and warning ones. */
	readonly isDegraded = $derived(this.alerts.length > 0 || !this.allReady);

	#driver: PrometheusDriver;
	#reload: ReloadManager;

	constructor(driver: PrometheusDriver) {
		this.#driver = driver;
		this.#reload = new ReloadManager(() => void this.refresh());
	}

	/** Start the periodic refresh, which fetches at once, or stop it. */
	setReloading(on: boolean) {
		if (on) this.#reload.restart();
		else this.#reload.stop();
	}

	stop() {
		this.#reload.stop();
	}

	isNodeReady(node: string): boolean | undefined {
		return this.nodes.find((candidate) => candidate.name === node)?.ready;
	}

	/** When KubeNodeNotReady started firing for a node, in Unix seconds. */
	notReadySince(node: string): number | undefined {
		return this.alerts.find(
			(alert) => alert.name === 'KubeNodeNotReady' && alert.labels.node === node
		)?.activeAt;
	}

	async refresh() {
		const r = await fetchCombinedInstantOrNull(this.#driver, QUERIES);
		if (!r) {
			// Keep what an earlier refresh showed; only a first load turns into an error.
			if (this.status === 'loading') this.status = 'error';
			return;
		}

		const nodes: Record<string, NodeSignal> = {};
		const ensure = (name: string) =>
			(nodes[name] ??= { name, ready: false, roles: [], isMaster: false, hasGpu: false });
		for (const series of r.nodes) {
			const name = labelsOf(series).node;
			if (name) ensure(name);
		}
		for (const series of r.ready) {
			const name = labelsOf(series).node;
			if (name) ensure(name).ready = Number(series.value?.value) === 1;
		}
		for (const series of r.roles) {
			const { node, role } = labelsOf(series);
			if (!node || !role) continue;
			const entry = ensure(node);
			entry.roles.push(role);
			if (role === 'control-plane' || role === 'master') entry.isMaster = true;
		}
		for (const series of r.gpu) {
			const name = labelsOf(series).node;
			if (name) ensure(name).hasGpu = true;
		}

		const since: Record<string, number> = {};
		for (const series of r.alertsSince) {
			const value = Number(series.value?.value);
			if (Number.isFinite(value)) since[alertKey(labelsOf(series))] = value;
		}
		const podReady: Record<string, boolean> = {};
		for (const series of r.controlPods) {
			const pod = labelsOf(series).pod;
			if (pod) podReady[pod] = Number(series.value?.value) === 1;
		}
		const firing: FiringAlert[] = r.alerts.map((series) => {
			const labels = { ...labelsOf(series) };
			delete labels.__name__;
			delete labels.alertstate;
			return {
				name: labels.alertname ?? '',
				severity: labels.severity ?? 'info',
				labels,
				activeAt: since[alertKey(labels)]
			};
		});
		// Scrape noise folds into an info alert first, so the scope filter then drops it with the
		// other info alerts; a component whose pods are down keeps its warnings.
		const alerts = clusterAlerts(foldScrapeNoise(firing, podReady));
		alerts.sort(
			(a, b) =>
				severityRank(a.severity) - severityRank(b.severity) ||
				(a.activeAt ?? Infinity) - (b.activeAt ?? Infinity) ||
				a.name.localeCompare(b.name)
		);

		const build = r.build[0] ? labelsOf(r.build[0]) : undefined;

		this.nodes = Object.values(nodes).sort((a, b) => a.name.localeCompare(b.name));
		this.alerts = alerts;
		this.kubernetesVersion = build?.git_version;
		this.kubernetesPlatform = build?.platform;
		this.updatedAt = Date.now();
		// A cluster always has a node; none means Prometheus has nothing for it.
		this.status = this.nodes.length > 0 ? 'ready' : 'empty';
	}
}

/**
 * `sum(expr)`, or the same sum over Ready nodes only. `expr` must carry a `node` label.
 * Unscoped it is the plain sum, so the all-nodes query is unchanged from before.
 */
export function scopedSum(expr: string, readyOnly: boolean): string {
	return readyOnly ? `sum(sum by (node) (${expr}) and on (node) ${READY_NODES})` : `sum(${expr})`;
}
