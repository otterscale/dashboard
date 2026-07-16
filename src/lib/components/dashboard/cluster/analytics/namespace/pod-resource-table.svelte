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
	import { formatCapacity, formatDuration, formatIO } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import {
		classifyThreshold,
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		thresholdClasses
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

	// Live per-pod snapshot table for the selected namespace.
	let {
		client,
		namespace,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		namespace: string | undefined;
		isReloading?: boolean;
	} = $props();

	type PodRow = {
		pod: string;
		cpu: number;
		mem: number;
		memLimit: number;
		// GPU columns only render when the namespace has GPU pods (see `hasGpu`).
		// `gpuUtil` is null (not 0) when HAMI reports nothing for the pod, so idle
		// GPU pods still show "0%" while GPU-free pods show "—".
		gpu: number;
		gpuUtil: number | null;
		gpuMem: number;
		restarts: number;
		ageSec: number;
		net: number;
	};

	const queries = $derived.by(() => {
		const ns = escapePromqlStringLiteral((namespace ?? '').trim());
		const base = `namespace="${ns}"`;
		// cAdvisor metrics: scope to a real container, never the pause sandbox.
		const cFilter = `,container!="",container!="POD"`;
		return {
			cpu: `sum by (namespace,pod)(irate(container_cpu_usage_seconds_total{${base}${cFilter}}[2m]))`,
			mem: `sum by (namespace,pod)(container_memory_working_set_bytes{${base}${cFilter}})`,
			memLimit: `sum by (namespace,pod)(kube_pod_container_resource_limits{${base},resource="memory",unit="byte"})`,
			// nvidia.com/gpu limits (KSM flattens dots to underscores) — allocated GPU count.
			gpu: `sum by (namespace,pod)(kube_pod_container_resource_limits{${base},resource="nvidia_com_gpu"})`,
			// HAMI device-plugin monitor keys its per-container metrics by podname/podnamespace
			// (its own pod owns the pod/namespace labels); the fetch loop falls back to podname.
			gpuUtil: `avg by (podnamespace,podname)(Device_utilization_desc_of_container{podnamespace="${ns}"})`,
			gpuMem: `sum by (podnamespace,podname)(Device_memory_desc_of_container{podnamespace="${ns}"})`,
			restarts: `sum by (namespace,pod)(kube_pod_container_status_restarts_total{${base}${cFilter}})`,
			created: `max by (namespace,pod)(kube_pod_created{${base}})`,
			netRx: `sum by (namespace,pod)(irate(container_network_receive_bytes_total{${base}}[2m]))`,
			netTx: `sum by (namespace,pod)(irate(container_network_transmit_bytes_total{${base}}[2m]))`
		};
	});

	let rows = $state<PodRow[]>([]);
	let isLoaded = $state(false);

	// GPU columns appear only when at least one pod in the namespace touches a GPU,
	// keeping the table compact for the common GPU-free namespace.
	const hasGpu = $derived(rows.some((r) => r.gpu > 0 || r.gpuMem > 0 || r.gpuUtil !== null));

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(client, queries);
			const byPod: Record<string, PodRow> = {};
			const ensure = (p: string): PodRow =>
				(byPod[p] ??= {
					pod: p,
					cpu: 0,
					mem: 0,
					memLimit: 0,
					gpu: 0,
					gpuUtil: null,
					gpuMem: 0,
					restarts: 0,
					ageSec: 0,
					net: 0
				});
			// `created` is an epoch timestamp → turn into an age; everything else accumulates.
			const assign: Record<string, (row: PodRow, v: number) => void> = {
				cpu: (r, v) => (r.cpu = v),
				mem: (r, v) => (r.mem = v),
				memLimit: (r, v) => (r.memLimit = v),
				gpu: (r, v) => (r.gpu = v),
				gpuUtil: (r, v) => (r.gpuUtil = v),
				gpuMem: (r, v) => (r.gpuMem = v),
				restarts: (r, v) => (r.restarts = v),
				created: (r, v) => (r.ageSec = Math.max(0, Date.now() / 1000 - v)),
				netRx: (r, v) => (r.net += v),
				netTx: (r, v) => (r.net += v)
			};
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const labels = v.metric.labels as Record<string, string>;
					const p = labels.pod || labels.podname;
					if (!p) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					assign[key]?.(ensure(p), value);
				}
			}
			// Surface trouble first: most-restarted pods on top, then the heaviest by memory.
			rows = Object.values(byPod).sort((a, b) => b.restarts - a.restarts || b.mem - a.mem);
		} catch (error) {
			console.error('Failed to fetch pod resource table:', error);
		}
	}

	function memPct(row: PodRow): number | null {
		return row.memLimit > 0 ? (row.mem / row.memLimit) * 100 : null;
	}
	function pctClass(value: number): string {
		return thresholdClasses(classifyThreshold(value, { green: 70, orange: 90 })).text;
	}
	function restartClass(n: number): string {
		if (n >= 5) return 'font-bold text-destructive';
		if (n >= 1) return 'text-chart-1';
		return 'text-muted-foreground';
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

	const SCROLL_AFTER = 8;
</script>

{#snippet table()}
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.pod()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.cpu()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.memory()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.memory_limit_percent()}</Table.Head>
					{#if hasGpu}
						<Table.Head class="text-right whitespace-nowrap">{m.gpu()}</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">{m.gpu_utilization()}</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">{m.gpu_memory()}</Table.Head>
					{/if}
					<Table.Head class="text-right whitespace-nowrap">{m.restarts()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.age()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.network()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.pod)}
					{@const mp = memPct(row)}
					{@const { value: memValue, unit: memUnit } = formatCapacity(row.mem)}
					{@const { value: netValue, unit: netUnit } = formatIO(row.net)}
					{@const { value: ageValue, unit: ageUnit } = formatDuration(row.ageSec)}
					<Table.Row class={cn(row.restarts >= 5 && 'bg-destructive/5')}>
						<Table.Cell class="max-w-[16rem] truncate font-medium" title={row.pod}>
							{row.pod}
						</Table.Cell>
						<Table.Cell class="text-right font-mono tabular-nums">
							{row.cpu.toFixed(2)}
						</Table.Cell>
						<Table.Cell class="text-right font-mono whitespace-nowrap tabular-nums">
							{memValue}
							{memUnit}
						</Table.Cell>
						<Table.Cell
							class={cn('text-right font-mono tabular-nums', mp !== null && pctClass(mp))}
						>
							{mp !== null ? `${Math.round(mp)}%` : '—'}
						</Table.Cell>
						{#if hasGpu}
							{@const { value: gpuMemValue, unit: gpuMemUnit } = formatCapacity(row.gpuMem)}
							<Table.Cell class="text-right font-mono tabular-nums">
								{row.gpu > 0 ? Math.round(row.gpu) : '—'}
							</Table.Cell>
							<Table.Cell class="text-right font-mono tabular-nums">
								{row.gpuUtil !== null ? `${Math.round(row.gpuUtil)}%` : '—'}
							</Table.Cell>
							<Table.Cell class="text-right font-mono whitespace-nowrap tabular-nums">
								{#if row.gpuMem > 0}
									{gpuMemValue}
									{gpuMemUnit}
								{:else}
									—
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class={cn('text-right font-mono tabular-nums', restartClass(row.restarts))}>
							{row.restarts}
						</Table.Cell>
						<Table.Cell class="text-right font-mono whitespace-nowrap tabular-nums">
							{ageValue.toFixed(1)}
							{ageUnit}
						</Table.Cell>
						<Table.Cell class="text-right font-mono whitespace-nowrap tabular-nums">
							{netValue}
							{netUnit}
						</Table.Cell>
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
				{m.pod_detail_table()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">{m.pod_detail_table_description()}</p>
		</div>
		<Sheet.Root>
			<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<Maximize2Icon class="size-5 text-muted-foreground" />
			</Sheet.Trigger>
			<Sheet.Content class="flex min-w-[50vw] flex-col gap-4 overflow-auto p-8">
				<Sheet.Header class="p-0">
					<Sheet.Title>{m.pod_detail_table()}</Sheet.Title>
					<Sheet.Description>{m.pod_detail_table_description()}</Sheet.Description>
				</Sheet.Header>
				{@render table()}
			</Sheet.Content>
		</Sheet.Root>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.pod_detail_table_tooltip()}</p>
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
			<ScrollArea class="h-96 w-full">
				{@render table()}
			</ScrollArea>
		{:else}
			{@render table()}
		{/if}
	</Statistics.Content>
</Statistics.Root>
