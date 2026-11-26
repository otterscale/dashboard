import type { FiringAlert } from './signals.svelte';

// kube-prometheus-stack scrapes etcd, kube-scheduler, kube-controller-manager and kube-proxy. On
// RKE2 the first three listen on 127.0.0.1 and Cilium can replace kube-proxy, so those scrapes
// fail and a dozen "down" alerts fire for components that are running fine. Those alerts are
// folded into one info row, but only after the pods say the component really is up: a component
// whose pods are not Ready keeps its own alerts.

export type Component = 'etcd' | 'kube-scheduler' | 'kube-controller-manager' | 'kube-proxy';

/** Static pod name prefix in kube-system, per component. */
const PREFIX: Record<Component, string> = {
	etcd: 'etcd-',
	'kube-scheduler': 'kube-scheduler-',
	'kube-controller-manager': 'kube-controller-manager-',
	'kube-proxy': 'kube-proxy-'
};

/** kube-prometheus-stack's scrape job per component. */
const JOB: Record<string, Component> = {
	'kube-etcd': 'etcd',
	'kube-scheduler': 'kube-scheduler',
	'kube-controller-manager': 'kube-controller-manager',
	'kube-proxy': 'kube-proxy'
};

/**
 * Alerts that only say "the scrape failed": they fire from `up == 0` or an absent target, never
 * from the component's own metrics.
 */
const SCRAPE_ALERTS: Record<string, Component> = {
	KubeSchedulerDown: 'kube-scheduler',
	KubeSchedulerInstanceUnreachable: 'kube-scheduler',
	KubeControllerManagerDown: 'kube-controller-manager',
	KubeControllerManagerInstanceUnreachable: 'kube-controller-manager',
	KubeProxyDown: 'kube-proxy',
	etcdMembersDown: 'etcd',
	etcdInsufficientMembers: 'etcd'
};

export const CONTROL_PLANE_PODS_QUERY =
	'max by (pod) (kube_pod_status_ready{namespace="kube-system", pod=~"(etcd|kube-scheduler|kube-controller-manager|kube-proxy)-.+", condition="true"})';

/** The alert's component when it is a scrape-failure alert, else undefined. */
export function scrapeComponent(alert: FiringAlert): Component | undefined {
	if (alert.name === 'TargetDown') return JOB[alert.labels.job ?? ''];
	return SCRAPE_ALERTS[alert.name];
}

/**
 * Whether the pods show the component running. kube-proxy with no pods at all has been replaced
 * (Cilium), so nothing is missing; the others must have at least one pod, all of them Ready.
 */
export function componentRunning(component: Component, podReady: Record<string, boolean>): boolean {
	const own = Object.entries(podReady).filter(([pod]) => pod.startsWith(PREFIX[component]));
	if (own.length === 0) return component === 'kube-proxy';
	return own.every(([, ready]) => ready);
}

export const SCRAPE_NOISE_ALERT = 'ControlPlaneNotScraped';

/**
 * Replace scrape-failure alerts of running components with one info alert naming them. Alerts
 * for components whose pods are not Ready, and every other alert, pass through unchanged.
 */
export function foldScrapeNoise(
	alerts: FiringAlert[],
	podReady: Record<string, boolean>
): FiringAlert[] {
	const kept: FiringAlert[] = [];
	const folded = new Set<Component>();
	let since: number | undefined;
	for (const alert of alerts) {
		const component = scrapeComponent(alert);
		if (component && componentRunning(component, podReady)) {
			folded.add(component);
			if (alert.activeAt !== undefined) since = Math.min(since ?? Infinity, alert.activeAt);
			continue;
		}
		kept.push(alert);
	}
	if (folded.size === 0) return kept;
	const components = [...folded].sort();
	return [
		...kept,
		{
			name: SCRAPE_NOISE_ALERT,
			severity: 'info',
			labels: { count: String(components.length), components: components.join(', ') },
			activeAt: since
		}
	];
}
