<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { classifyThreshold, type ThresholdLevel } from '$lib/prometheus';

	// Single-value node rankings that complement the CPU/Memory request-pressure cards.
	// `kind="pods"` ranks by running-pod density (% of allocatable pods); `kind="restart"`
	// ranks by pod container restarts over the last hour (a health signal). Both
	// kube-state-metrics series are keyed by `namespace,pod`, so they join `kube_pod_info`
	// to carry the `node` label that the rest of Section A (and the drill-in click) uses.
	let {
		prometheusDriver,
		kind,
		title,
		description,
		tooltip,
		onNodeClick,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		kind: 'pods' | 'restart';
		title: string;
		description: string;
		tooltip: string;
		onNodeClick?: (node: string) => void;
		isReloading?: boolean;
	} = $props();

	const query = $derived(
		kind === 'pods'
			? `100 * sum(kube_pod_status_phase{phase="Running"} * on(namespace,pod) group_left(node) kube_pod_info) by (node) / sum(kube_node_status_allocatable{resource="pods"}) by (node)`
			: // `> 0` keeps the chart to nodes that actually had restarts — empty is the healthy state.
				`sum(increase(kube_pod_container_status_restarts_total[1h]) * on(namespace,pod) group_left(node) kube_pod_info) by (node) > 0`
	);

	type Bar = {
		label: string;
		value: number;
		displayValue: string;
		barClass?: string;
		textClass?: string;
	};
	let bars = $state<Bar[]>([]);
	let isLoaded = $state(false);

	function displayValue(value: number): string {
		return kind === 'pods' ? `${Math.round(value)}%` : `${Math.round(value)}`;
	}
	// Both kinds carry a health meaning, so colour the bars by threshold. Pod density reads as
	// scheduling pressure (green ≤70%, orange ≤90%, red above). Restarts only ever list nodes
	// with ≥1 restart, so green never shows — 1–10/h is orange, >10/h (sustained crash-looping)
	// turns red.
	function classes(value: number): { barClass?: string; textClass?: string } {
		const level: ThresholdLevel =
			kind === 'pods'
				? classifyThreshold(value, { green: 70, orange: 90 })
				: classifyThreshold(value, { green: 0, orange: 10 });
		return {
			barClass:
				level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2',
			textClass: level === 'red' ? 'text-destructive' : ''
		};
	}

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(query);
			const series = (response.result ?? []) as {
				metric: { labels: Record<string, string> };
				value?: { value: unknown };
			}[];
			bars = series
				.map((s) => {
					const node = s.metric?.labels?.node ?? '';
					const value = Number(s.value?.value);
					return node && Number.isFinite(value)
						? { label: node, value, displayValue: displayValue(value), ...classes(value) }
						: null;
				})
				.filter((b): b is Bar => b !== null)
				.sort((a, b) => b.value - a.value);
		} catch (error) {
			console.error('Failed to fetch node ranking:', error);
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
