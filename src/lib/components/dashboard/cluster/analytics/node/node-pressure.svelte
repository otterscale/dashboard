<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type TopBar, TopBarList } from '$lib/components/custom/top-bar-list';
	import { m } from '$lib/messages';
	import {
		classifyThreshold,
		fetchCombinedInstant,
		LIVE_PODS,
		type ThresholdLevel,
		withoutLimit
	} from '$lib/prometheus';

	// Reusable node-pressure ranking: one bar per node, sized by Request%, labelled with usage,
	// request and limit as percentages of the same allocatable total. Used for both CPU
	// (resource="cpu", unit="core") and memory.
	let {
		prometheusDriver,
		resource,
		title,
		description,
		tooltip,
		onNodeClick,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		resource: 'cpu' | 'memory';
		title: string;
		description: string;
		tooltip: string;
		onNodeClick?: (node: string) => void;
		isReloading?: boolean;
	} = $props();

	const unit = $derived(resource === 'cpu' ? 'core' : 'byte');
	const alloc = $derived(
		`sum(kube_node_status_allocatable{resource="${resource}", unit="${unit}"}) by (node)`
	);
	// Usage divides by the same allocatable total as the two bookings, so all three read against
	// one denominator. It counts only what containers consume — a node's own kernel and system
	// memory sit outside it, which is why this reads lower than the node_exporter charts.
	const usage = $derived(
		resource === 'cpu'
			? 'irate(container_cpu_usage_seconds_total{container!="",container!="POD"}[2m])'
			: 'container_memory_working_set_bytes{container!="",container!="POD"}'
	);

	// LIVE_PODS on both sums: KSM keeps emitting requests/limits for Succeeded/Failed pods, so
	// finished Jobs would pile into the node totals — the same defect fixed in the overview
	// pressure table. Measured on a dev cluster with 7 completed pods, the CPU limit label read
	// 642% against a true 108%.
	const queries = $derived.by(() => {
		// `kube_pod_container_info` carries no `node`, so the join supplies it — and because
		// `kube_pod_info` is gated on LIVE_PODS, the same join drops terminated pods. The
		// parentheses are load-bearing: `*` binds tighter than `and`/`unless`, so without them
		// the expression collapses to the bare left side and loses `node` entirely.
		const placement = `max by (namespace,pod,node)(kube_pod_info ${LIVE_PODS})`;
		const onNode = (expr: string) =>
			`count by (node)((${expr}) * on (namespace,pod) group_left(node) (${placement}))`;
		return {
			use: `100 * sum(${usage}) by (node) / ${alloc}`,
			req: `100 * sum(kube_pod_container_resource_requests{resource="${resource}", unit="${unit}"} ${LIVE_PODS}) by (node) / ${alloc}`,
			lim: `100 * sum(kube_pod_container_resource_limits{resource="${resource}", unit="${unit}"} ${LIVE_PODS}) by (node) / ${alloc}`,
			// The limit percentage only covers the containers that declared one: this node reads
			// 108% while 137 of its 157 containers have no CPU ceiling at all, so the real headroom
			// is far worse than the number suggests.
			open: onNode(`kube_pod_container_info ${withoutLimit(resource)}`),
			containers: onNode('kube_pod_container_info')
		};
	});

	let bars = $state<TopBar[]>([]);
	let isLoaded = $state(false);

	function barClass(level: ThresholdLevel): string {
		return level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2';
	}
	function textClass(level: ThresholdLevel): string {
		return level === 'red' ? 'text-destructive' : '';
	}

	type Row = { use: number; req: number; lim: number; open: number; containers: number };

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(prometheusDriver, queries);
			const byNode: Record<string, Row> = {};
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const node = (v.metric.labels as Record<string, string>).node;
					if (!node) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					const row = (byNode[node] ??= { use: 0, req: 0, lim: 0, open: 0, containers: 0 });
					row[key as keyof Row] = value;
				}
			}
			bars = Object.entries(byNode)
				.map(([node, { use, req, lim, open, containers }]) => {
					// Colour by request%, matching the bar length: request is what constrains
					// scheduling (its sum can't exceed allocatable), whereas a limit% over 100% is a
					// normal burst-ceiling overcommit and would otherwise paint almost every node red.
					const level = classifyThreshold(req, { green: 70, orange: 90 });
					return {
						label: node,
						value: req,
						// Whole percentages: a node's share of its own capacity is never read to a
						// decimal, and three numbers have to fit the same slot two used to.
						displayValue: `${Math.round(use)}% / ${Math.round(req)}% / ${Math.round(lim)}%`,
						warning:
							open > 0 ? m.containers_without_limit({ uncapped: open, containers }) : undefined,
						barClass: barClass(level),
						textClass: textClass(level)
					};
				})
				.sort((a, b) => b.value - a.value);
		} catch (error) {
			console.error('Failed to fetch node pressure:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<TopBarList {title} {description} {tooltip} {bars} {isLoaded} onBarClick={onNodeClick} scrollable />
