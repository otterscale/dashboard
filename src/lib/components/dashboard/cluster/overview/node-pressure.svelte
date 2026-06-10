<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { classifyThreshold, fetchCombinedInstant, thresholdClasses } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	type NodeRow = {
		node: string;
		cpuUse: number;
		cpuReq: number;
		cpuLim: number;
		memUse: number;
		memReq: number;
		memLim: number;
	};

	// All ratios share the same per-node allocatable base so Usage / Request / Limit are
	// directly comparable. Request/Limit at or above 100% means the node cannot schedule
	// new pods even when actual Usage is low.
	const ALLOC_CPU = 'sum(kube_node_status_allocatable{resource="cpu", unit="core"}) by (node)';
	const ALLOC_MEM = 'sum(kube_node_status_allocatable{resource="memory", unit="byte"}) by (node)';
	const queries = {
		cpuUse: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) by (node) / ${ALLOC_CPU}`,
		cpuReq: `100 * sum(kube_pod_container_resource_requests{resource="cpu", unit="core"}) by (node) / ${ALLOC_CPU}`,
		cpuLim: `100 * sum(kube_pod_container_resource_limits{resource="cpu", unit="core"}) by (node) / ${ALLOC_CPU}`,
		memUse: `100 * sum(container_memory_working_set_bytes{container!=""}) by (node) / ${ALLOC_MEM}`,
		memReq: `100 * sum(kube_pod_container_resource_requests{resource="memory", unit="byte"}) by (node) / ${ALLOC_MEM}`,
		memLim: `100 * sum(kube_pod_container_resource_limits{resource="memory", unit="byte"}) by (node) / ${ALLOC_MEM}`
	};

	let rows = $state<NodeRow[]>([]);
	let isLoaded = $state(false);

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(prometheusDriver, queries);
			const byNode: Record<string, NodeRow> = {};
			const ensure = (node: string): NodeRow =>
				(byNode[node] ??= {
					node,
					cpuUse: 0,
					cpuReq: 0,
					cpuLim: 0,
					memUse: 0,
					memReq: 0,
					memLim: 0
				});
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const node = (v.metric.labels as Record<string, string>).node;
					if (!node) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					ensure(node)[key as keyof Omit<NodeRow, 'node'>] = value;
				}
			}
			rows = Object.values(byNode).sort((a, b) => pressure(b) - pressure(a));
		} catch (error) {
			console.error('Failed to fetch node pressure:', error);
		}
	}

	// Worst reservation pressure on a node — what blocks scheduling / risks eviction.
	function pressure(row: NodeRow): number {
		return Math.max(row.cpuReq, row.cpuLim, row.memReq, row.memLim);
	}

	function pctClass(value: number): string {
		return thresholdClasses(classifyThreshold(value, { green: 70, orange: 90 })).text;
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

	const columns: { key: keyof Omit<NodeRow, 'node'>; label: string }[] = [
		{ key: 'cpuUse', label: 'CPU Usage' },
		{ key: 'cpuReq', label: 'CPU Request' },
		{ key: 'cpuLim', label: 'CPU Limit' },
		{ key: 'memUse', label: 'Mem Usage' },
		{ key: 'memReq', label: 'Mem Request' },
		{ key: 'memLim', label: 'Mem Limit' }
	];

	// Up to SCROLL_AFTER rows the table renders at its natural height (hugs the content, no
	// trailing whitespace); beyond that it goes into a fixed-height ScrollArea so a large
	// cluster scrolls instead of growing the card without bound.
	const SCROLL_AFTER = 5;
</script>

{#snippet table()}
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.node()}</Table.Head>
					{#each columns as col (col.key)}
						<Table.Head class="text-right whitespace-nowrap">{col.label}</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.node)}
					{@const saturated = pressure(row) >= 100}
					<Table.Row class={cn(saturated && 'bg-destructive/5')}>
						<Table.Cell class="font-medium" title={row.node}>{row.node}</Table.Cell>
						{#each columns as col (col.key)}
							<Table.Cell class={cn('text-right font-mono tabular-nums', pctClass(row[col.key]))}>
								{Math.round(row[col.key])}%
							</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/snippet}

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.node_resource_pressure()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.cluster_dashboard_node_pressure_description()}
			</p>
		</div>
		<Sheet.Root>
			<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<Maximize2Icon class="size-5 text-muted-foreground" />
			</Sheet.Trigger>
			<Sheet.Content class="flex min-w-[50vw] flex-col gap-4 overflow-auto p-8">
				<Sheet.Header class="p-0">
					<Sheet.Title>{m.node_resource_pressure()}</Sheet.Title>
					<Sheet.Description>{m.cluster_dashboard_node_pressure_description()}</Sheet.Description>
				</Sheet.Header>
				{@render table()}
			</Sheet.Content>
		</Sheet.Root>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_node_pressure_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-50 w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if rows.length === 0}
			<div class="flex h-50 w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else if rows.length > SCROLL_AFTER}
			<ScrollArea class="h-80 w-full">
				{@render table()}
			</ScrollArea>
		{:else}
			{@render table()}
		{/if}
	</Statistics.Content>
</Statistics.Root>
