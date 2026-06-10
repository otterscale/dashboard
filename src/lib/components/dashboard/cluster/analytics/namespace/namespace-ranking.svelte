<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatCapacity } from '$lib/formatter';
	import { classifyThreshold, type ThresholdLevel } from '$lib/prometheus';

	// Reusable "top namespaces" ranking. `kind="cpu"` ranks by live CPU cores;
	// `kind="memory"` ranks by working-set bytes; `kind="pods"` ranks by running pod count;
	// `kind="restart"` ranks by pod container restarts over the last hour (a health signal
	// rather than a consumption one).
	let {
		prometheusDriver,
		kind,
		title,
		description,
		tooltip,
		onNamespaceClick,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		kind: 'cpu' | 'memory' | 'pods' | 'restart';
		title: string;
		description: string;
		tooltip: string;
		onNamespaceClick?: (namespace: string) => void;
		isReloading?: boolean;
	} = $props();

	const query = $derived.by(() => {
		switch (kind) {
			case 'cpu':
				return `sum(irate(container_cpu_usage_seconds_total{container!="",container!="POD"}[2m])) by (namespace)`;
			case 'memory':
				return `sum(container_memory_working_set_bytes{container!="",container!="POD"}) by (namespace) > 1*1024*1024*1024`;
			case 'pods':
				return `sum(kube_pod_status_phase{phase="Running"}) by (namespace) > 0`;
			// `> 0` keeps the chart to namespaces that actually restarted — in a healthy cluster
			// this list is empty, which is the intended "nothing to see here" state.
			case 'restart':
				return `sum(increase(kube_pod_container_status_restarts_total[1h])) by (namespace) > 0`;
		}
	});

	function displayValue(value: number): string {
		if (kind === 'cpu') return `${value.toFixed(1)} cores`;
		if (kind === 'pods' || kind === 'restart') return `${Math.round(value)}`;
		const { value: v, unit } = formatCapacity(value);
		return `${v} ${unit}`;
	}

	// Only the restart ranking carries a health threshold: the list only ever shows namespaces
	// with ≥1 restart, so 1–10/h is orange and >10/h (sustained crash-looping) turns red.
	function classes(value: number): { barClass?: string; textClass?: string } {
		if (kind !== 'restart') return {};
		const level: ThresholdLevel = classifyThreshold(value, { green: 0, orange: 10 });
		return {
			barClass:
				level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2',
			textClass: level === 'red' ? 'text-destructive' : ''
		};
	}

	type Bar = {
		label: string;
		value: number;
		displayValue: string;
		barClass?: string;
		textClass?: string;
	};
	let bars = $state<Bar[]>([]);
	let isLoaded = $state(false);

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(query);
			const series = (response.result ?? []) as {
				metric: { labels: Record<string, string> };
				value?: { value: unknown };
			}[];
			bars = series
				.map((s) => {
					const namespace = s.metric?.labels?.namespace ?? '';
					const value = Number(s.value?.value);
					return namespace && Number.isFinite(value)
						? { label: namespace, value, displayValue: displayValue(value), ...classes(value) }
						: null;
				})
				.filter((b): b is Bar => b !== null)
				.sort((a, b) => b.value - a.value);
		} catch (error) {
			console.error('Failed to fetch namespace ranking:', error);
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

<TopBarList
	{title}
	{description}
	{tooltip}
	{bars}
	{isLoaded}
	onBarClick={onNamespaceClick}
	scrollable
/>
