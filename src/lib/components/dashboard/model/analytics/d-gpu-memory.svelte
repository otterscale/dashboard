<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { AnnotationLine, Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver, type RangeVector } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import {
		computeStep,
		type DataPoint,
		escapePromqlStringLiteral,
		fetchModelNodes
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	// DCGM exposes FB memory in MiB; divide by 1024 to display as GiB.
	const MIB_PER_GIB = 1024;
	const WARN_PCT = 80;
	const CRIT_PCT = 95;
	const NODE_PALETTE = [
		'var(--chart-1)',
		'var(--chart-2)',
		'var(--chart-3)',
		'var(--chart-4)',
		'var(--chart-5)'
	];

	type NodeInfo = { totalGiB: number; gpuCount: number; maxPct: number };
	type NodeSample = { usedGiB: number; pct: number };

	let data = $state<DataPoint[]>([]);
	let hosts = $state<string[]>([]);
	let hostInfo = $state<Record<string, NodeInfo>>({});
	let lookup = $state<Record<number, Record<string, NodeSample>>>({});
	let nodeCount = $state(0);
	let isLoaded = $state(false);

	// Captured during labelFormatter so the value formatter can find the matching sample.
	// Plain `let` is intentional — see d-memory-usage.svelte for rationale.
	// svelte-ignore non_reactive_update
	let hoveredDateMs: number | null = null;

	function regexEscape(node: string): string {
		return node.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&');
	}

	function nodeRegex(nodes: string[]): string {
		return nodes.map(regexEscape).join('|');
	}

	async function fetch() {
		try {
			const nodes = await fetchModelNodes(prometheusDriver, namespace, selectedModel);
			nodeCount = nodes.length;
			if (nodes.length === 0) {
				data = [];
				hosts = [];
				hostInfo = {};
				lookup = {};
				return;
			}
			const regex = escapePromqlStringLiteral(nodeRegex(nodes));
			const selector = `{Hostname=~"${regex}"}`;
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);

			const usedQuery = `sum by(Hostname) (DCGM_FI_DEV_FB_USED${selector})`;
			// Total VRAM is constant — an instant query is enough. A range query here would
			// re-evaluate the USED + FREE vector add at every step over the window.
			const totalQuery = `sum by(Hostname) (DCGM_FI_DEV_FB_USED${selector} + DCGM_FI_DEV_FB_FREE${selector})`;
			const countQuery = `count by(Hostname) (DCGM_FI_DEV_FB_USED${selector})`;

			const [usedResp, totalResp, countResp] = await Promise.all([
				prometheusDriver.rangeQuery(usedQuery, new Date(startMs), new Date(endMs), `${step}s`),
				prometheusDriver.instantQuery(totalQuery),
				prometheusDriver.instantQuery(countQuery)
			]);

			const gpuCountByHost: Record<string, number> = {};
			for (const v of countResp.result) {
				const host = (v.metric.labels as Record<string, string>).Hostname ?? '?';
				gpuCountByHost[host] = Math.round(Number(v.value?.value));
			}
			const totalMiBByHost: Record<string, number> = {};
			const latestTotalGiBByHost: Record<string, number> = {};
			for (const v of totalResp.result) {
				const host = (v.metric.labels as Record<string, string>).Hostname ?? '?';
				const total = Number(v.value?.value);
				if (!Number.isFinite(total) || total <= 0) continue;
				totalMiBByHost[host] = total;
				latestTotalGiBByHost[host] = total / MIB_PER_GIB;
			}

			const seenHosts: Record<string, true> = {};
			const dateMap: Record<number, DataPoint> = {};
			const nextLookup: Record<number, Record<string, NodeSample>> = {};
			const maxPctByHost: Record<string, number> = {};

			for (const v of usedResp.result as RangeVector[]) {
				const host = (v.metric.labels as Record<string, string>).Hostname ?? '?';
				const totalMiB = totalMiBByHost[host];
				if (!totalMiB) continue;
				seenHosts[host] = true;
				for (const sample of v.values) {
					const t = (sample.time as Date).getTime();
					const usedMiB = Number(sample.value);
					const pct = (usedMiB / totalMiB) * 100;
					const usedGiB = usedMiB / MIB_PER_GIB;
					if (!dateMap[t]) dateMap[t] = { date: sample.time as Date };
					dateMap[t][host] = pct;
					if (!nextLookup[t]) nextLookup[t] = {};
					nextLookup[t][host] = { usedGiB, pct };
					if (pct > (maxPctByHost[host] ?? 0)) maxPctByHost[host] = pct;
				}
			}

			hosts = Object.keys(seenHosts).sort();
			hostInfo = Object.fromEntries(
				hosts.map((h) => [
					h,
					{
						totalGiB: latestTotalGiBByHost[h] ?? 0,
						gpuCount: gpuCountByHost[h] ?? 0,
						maxPct: maxPctByHost[h] ?? 0
					}
				])
			);
			lookup = nextLookup;
			data = Object.values(dateMap).sort(
				(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
			);
		} catch {
			data = [];
			hosts = [];
			hostInfo = {};
			lookup = {};
		}
	}

	function colorForMax(maxPct: number, paletteIndex: number): string {
		if (maxPct >= CRIT_PCT) return 'var(--destructive)';
		if (maxPct >= WARN_PCT) return 'var(--chart-1)';
		return NODE_PALETTE[paletteIndex % NODE_PALETTE.length];
	}

	const chartConfig = $derived.by<Chart.ChartConfig>(() => {
		const config: Chart.ChartConfig = {};
		hosts.forEach((host, i) => {
			const info = hostInfo[host];
			config[host] = { label: host, color: colorForMax(info?.maxPct ?? 0, i) };
		});
		return config;
	});

	const series = $derived(
		hosts.map((host) => ({
			key: host,
			label: host,
			color: (chartConfig[host] as { color: string }).color
		}))
	);

	const reloadManager = new ReloadManager(fetch);

	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.2,
		line: { class: 'stroke-2' },
		motion: 'tween'
	} as const;
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.gpu_memory_allocated_vs_used()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.llm_dashboard_gpu_memory_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_gpu_memory_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[260px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if nodeCount === 0}
			<div class="flex h-[260px] w-full flex-col items-center justify-center gap-2">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{m.no_gpu_for_model()}</p>
			</div>
		{:else if data.length === 0 || hosts.length === 0}
			<div class="flex h-[260px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="h-[260px] w-full">
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yDomain={[0, 100]}
					{series}
					seriesLayout="overlap"
					props={{
						area: areaProps,
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`
						},
						yAxis: { format: (v: number) => `${v.toFixed(0)}%` }
					}}
				>
					{#snippet marks({ context })}
						<AnnotationLine
							y={WARN_PCT}
							props={{
								line: {
									class: 'stroke-chart-1',
									'stroke-dasharray': '4 4',
									'stroke-width': 1
								}
							}}
						/>
						<AnnotationLine
							y={CRIT_PCT}
							props={{
								line: {
									class: 'stroke-destructive',
									'stroke-dasharray': '4 4',
									'stroke-width': 1
								}
							}}
						/>
						{#each context.series.visibleSeries as s (s.key)}
							<LinearGradient
								stops={[s.color ?? '', 'color-mix(in lch, ' + s.color + ' 10%, transparent)']}
								vertical
							>
								{#snippet children({ gradient })}
									<Area seriesKey={s.key} {...areaProps} fill={gradient} />
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}
					{#snippet tooltip()}
						<Chart.Tooltip
							class="max-w-md min-w-[18rem]"
							indicator="dot"
							labelFormatter={(v: Date) => {
								hoveredDateMs = v.getTime();
								return v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								});
							}}
						>
							{#snippet formatter({ item, name, value })}
								{@const hostKey = String(name)}
								{@const info = hostInfo[hostKey]}
								{@const sample =
									hoveredDateMs != null ? lookup[hoveredDateMs]?.[hostKey] : undefined}
								{@const pct = sample?.pct ?? Number(value)}
								<div
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="mt-1 size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 flex-col gap-0.5 leading-tight">
									<span class="text-xs break-all text-muted-foreground" title={String(name)}>
										{name}
									</span>
									<span class="font-mono text-sm font-medium text-foreground tabular-nums">
										{pct.toFixed(1)}%
										{#if sample && info}
											<span class="text-xs font-normal text-muted-foreground">
												({sample.usedGiB.toFixed(0)} / {info.totalGiB.toFixed(0)} GiB,
												{info.gpuCount}
												{info.gpuCount === 1 ? m.gpu() : m.gpus()})
											</span>
										{/if}
									</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>
