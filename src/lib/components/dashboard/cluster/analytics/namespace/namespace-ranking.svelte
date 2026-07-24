<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { classifyThreshold, type ThresholdLevel } from '$lib/prometheus';

	// Reusable "top namespaces" ranking. `kind="cpu"` ranks by live CPU cores;
	// `kind="memory"` ranks by working-set bytes; `kind="gpu"` ranks by nvidia.com/gpu
	// limits of ready pods; `kind="restart"` ranks by pod container restarts over the
	// last hour (a health signal rather than a consumption one).
	let {
		prometheusDriver,
		kind,
		title,
		description,
		tooltip,
		onNamespaceClick,
		namespaceToWorkspace = {},
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		kind: 'cpu' | 'memory' | 'gpu' | 'restart';
		title: string;
		description: string;
		tooltip: string;
		onNamespaceClick?: (namespace: string) => void;
		// namespace → workspace name; bars display the workspace, falling back to the namespace.
		namespaceToWorkspace?: Record<string, string>;
		isReloading?: boolean;
	} = $props();

	const query = $derived.by(() => {
		switch (kind) {
			case 'cpu':
				return `sum(irate(container_cpu_usage_seconds_total{container!="",container!="POD"}[2m])) by (namespace)`;
			case 'memory':
				return `sum(container_memory_working_set_bytes{container!="",container!="POD"}) by (namespace) > 1*1024*1024*1024`;
			// nvidia.com/gpu limits (KSM flattens dots to underscores) of ready pods only, so
			// completed/pending pods don't inflate the count. `> 0` hides GPU-free namespaces.
			case 'gpu':
				return `sum(kube_pod_container_resource_limits{resource="nvidia_com_gpu"} and on (namespace, pod, container) kube_pod_container_status_ready == 1) by (namespace) > 0`;
			// `> 0` keeps the chart to namespaces that actually restarted — in a healthy cluster
			// this list is empty, which is the intended "nothing to see here" state.
			case 'restart':
				return `sum(increase(kube_pod_container_status_restarts_total[1h])) by (namespace) > 0`;
		}
	});

	function displayValue(value: number): string {
		if (kind === 'cpu') return `${value.toFixed(1)} cores`;
		if (kind === 'gpu') return `${Math.round(value)} GPU`;
		if (kind === 'restart') return `${Math.round(value)}`;
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

	// Raw rows keep the namespace; the displayed label is resolved at render so bars relabel
	// reactively if the workspace map arrives after the first fetch.
	type RawBar = {
		namespace: string;
		value: number;
		displayValue: string;
		barClass?: string;
		textClass?: string;
	};
	let rawBars = $state<RawBar[]>([]);
	let isLoaded = $state(false);

	// label = workspace name (fallback: namespace); id = namespace (click payload for drill-in).
	// Bars resolved to a workspace get a "Workspace" badge, like the standalone-model tag.
	const bars = $derived(
		rawBars.map((b) => {
			const workspace = namespaceToWorkspace[b.namespace];
			return {
				label: workspace || b.namespace,
				id: b.namespace,
				badge: workspace ? m.workspace() : undefined,
				value: b.value,
				displayValue: b.displayValue,
				barClass: b.barClass,
				textClass: b.textClass
			};
		})
	);

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(query);
			const series = (response.result ?? []) as {
				metric: { labels: Record<string, string> };
				value?: { value: unknown };
			}[];
			rawBars = series
				.map((s) => {
					const namespace = s.metric?.labels?.namespace ?? '';
					const value = Number(s.value?.value);
					return namespace && Number.isFinite(value)
						? { namespace, value, displayValue: displayValue(value), ...classes(value) }
						: null;
				})
				.filter((b): b is RawBar => b !== null)
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
