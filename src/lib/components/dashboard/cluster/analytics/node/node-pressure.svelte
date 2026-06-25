<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type TopBar, TopBarList } from '$lib/components/custom/top-bar-list';
	import { classifyThreshold, fetchCombinedInstant, type ThresholdLevel } from '$lib/prometheus';

	// Reusable node-pressure ranking: one bar per node, sized by Request%, labelled with the
	// Limit% beside it. Used for both CPU (resource="cpu", unit="core") and memory.
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
	const queries = $derived({
		req: `100 * sum(kube_pod_container_resource_requests{resource="${resource}", unit="${unit}"}) by (node) / ${alloc}`,
		lim: `100 * sum(kube_pod_container_resource_limits{resource="${resource}", unit="${unit}"}) by (node) / ${alloc}`
	});

	let bars = $state<TopBar[]>([]);
	let isLoaded = $state(false);

	function barClass(level: ThresholdLevel): string {
		return level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2';
	}
	function textClass(level: ThresholdLevel): string {
		return level === 'red' ? 'text-destructive' : '';
	}

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(prometheusDriver, queries);
			const byNode: Record<string, { req: number; lim: number }> = {};
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const node = (v.metric.labels as Record<string, string>).node;
					if (!node) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					const row = (byNode[node] ??= { req: 0, lim: 0 });
					row[key as 'req' | 'lim'] = value;
				}
			}
			bars = Object.entries(byNode)
				.map(([node, { req, lim }]) => {
					// Colour by request%, matching the bar length: request is what constrains
					// scheduling (its sum can't exceed allocatable), whereas a limit% over 100% is a
					// normal burst-ceiling overcommit and would otherwise paint almost every node red.
					const level = classifyThreshold(req, { green: 70, orange: 90 });
					return {
						label: node,
						value: req,
						displayValue: `${Math.round(req)}% / ${Math.round(lim)}%`,
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
