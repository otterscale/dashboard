<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { classifyThreshold, type ThresholdLevel } from '$lib/prometheus';

	// Single-value node rankings complementing the CPU/Memory pressure cards. `pods` and
	// `restart` are kube-state-metrics joined to `kube_pod_info` for the `node` label;
	// `gpu` ranks by avg GPU utilisation, keyed by DCGM `Hostname` (== node name). All three
	// label values feed the same node drill-in click.
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
		kind: 'pods' | 'restart' | 'gpu';
		title: string;
		description: string;
		tooltip: string;
		onNodeClick?: (node: string) => void;
		isReloading?: boolean;
	} = $props();

	const query = $derived.by(() => {
		switch (kind) {
			case 'pods':
				return `100 * sum(kube_pod_status_phase{phase="Running"} * on(namespace,pod) group_left(node) kube_pod_info) by (node) / sum(kube_node_status_allocatable{resource="pods"}) by (node)`;
			case 'restart':
				// `> 0` keeps the chart to nodes that actually had restarts — empty is the healthy state.
				return `sum(increase(kube_pod_container_status_restarts_total[1h]) * on(namespace,pod) group_left(node) kube_pod_info) by (node) > 0`;
			case 'gpu':
				return `avg by(Hostname) (DCGM_FI_DEV_GPU_UTIL)`;
		}
	});
	const labelKey = $derived(kind === 'gpu' ? 'Hostname' : 'node');

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
		return kind === 'restart' ? `${Math.round(value)}` : `${Math.round(value)}%`;
	}
	// Pods/restarts carry a health meaning, so colour those bars by threshold. Pod density
	// reads as scheduling pressure (green ≤70%, orange ≤90%, red above). Restarts only ever
	// list nodes with ≥1 restart, so green never shows — 1–10/h is orange, >10/h (sustained
	// crash-looping) turns red. GPU utilisation is the opposite — high is the desired state —
	// so it gets one calm colour and lets the descending rank surface idle nodes instead.
	function classes(value: number): { barClass?: string; textClass?: string } {
		if (kind === 'gpu') return { barClass: 'bg-chart-2' };
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
					const node = s.metric?.labels?.[labelKey] ?? '';
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
