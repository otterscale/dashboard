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
		vllmMetricWithSelector
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

	const BYTES_PER_GIB = 1024 ** 3;
	const WARN_PCT = 70;
	const CRIT_PCT = 90;
	const POD_PALETTE = [
		'var(--chart-1)',
		'var(--chart-2)',
		'var(--chart-3)',
		'var(--chart-4)',
		'var(--chart-5)'
	];

	type Mode = 'percentage' | 'absolute';
	type PodInfo = { limitGiB: number; maxPct: number };
	type PodSample = { usageGiB: number; pct: number };

	let mode = $state<Mode>('percentage');
	let data = $state<DataPoint[]>([]);
	let pods = $state<string[]>([]);
	let podInfo = $state<Record<string, PodInfo>>({});
	let lookup = $state<Record<number, Record<string, PodSample>>>({});
	let isLoaded = $state(false);

	// Captured during labelFormatter so the value formatter can find the matching usage sample.
	// Intentionally a plain `let`: labelFormatter runs inside chart-tooltip's `$derived`, where
	// writing to `$state` is unsafe. The snippet re-renders whenever the tooltip's reactive deps
	// change, so a non-reactive value is read with up-to-date data.
	// svelte-ignore non_reactive_update
	let hoveredDateMs: number | null = null;

	// Join on `container` too so the model container is picked by the vLLM metric's own
	// `container` label (KServe names it `main`, a raw vLLM Deployment names it `vllm`, etc.).
	// This also drops pod sidecars (istio/queue-proxy), which never emit vLLM metrics.
	function modelFilter(): string {
		return `* on(namespace, pod, container) group_left() group by(namespace, pod, container) (${vllmMetricWithSelector(
			'vllm:kv_cache_usage_perc',
			namespace,
			selectedModel
		)})`;
	}

	function buildContainerSelector(extra = ''): string {
		const ns = (namespace ?? '').trim();
		const parts: string[] = [];
		if (ns) parts.push(`namespace="${escapePromqlStringLiteral(ns)}"`);
		if (extra) parts.push(extra);
		return `{${parts.join(',')}}`;
	}

	function usageQuery(): string {
		return (
			`topk(10, sum by(pod) (` +
			`container_memory_working_set_bytes${buildContainerSelector()} ${modelFilter()}` +
			`))`
		);
	}

	function limitQuery(): string {
		return (
			`sum by(pod) (` +
			`kube_pod_container_resource_limits${buildContainerSelector('resource="memory"')} ${modelFilter()}` +
			`)`
		);
	}

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);
			const [usageResp, limitResp] = await Promise.all([
				prometheusDriver.rangeQuery(usageQuery(), new Date(startMs), new Date(endMs), `${step}s`),
				prometheusDriver.rangeQuery(limitQuery(), new Date(startMs), new Date(endMs), `${step}s`)
			]);

			// Take the latest observed limit per pod (limits rarely change mid-life).
			const limitGiBByPod: Record<string, number> = {};
			for (const v of limitResp.result as RangeVector[]) {
				const pod = (v.metric.labels as Record<string, string>).pod ?? '(unknown)';
				const last = v.values[v.values.length - 1];
				const limit = last ? Number(last.value) / BYTES_PER_GIB : 0;
				if (limit > 0) limitGiBByPod[pod] = limit;
			}

			// Percentage view requires at least one pod with a memory limit; otherwise we
			// fall back to plotting absolute working-set GiB so the user still gets data.
			const nextMode: Mode = Object.keys(limitGiBByPod).length > 0 ? 'percentage' : 'absolute';

			const seenPods: Record<string, true> = {};
			const dateMap: Record<number, DataPoint> = {};
			const nextLookup: Record<number, Record<string, PodSample>> = {};
			const maxPctByPod: Record<string, number> = {};

			for (const v of usageResp.result as RangeVector[]) {
				const pod = (v.metric.labels as Record<string, string>).pod ?? '(unknown)';
				const limit = limitGiBByPod[pod];
				if (nextMode === 'percentage' && !limit) continue;
				seenPods[pod] = true;
				for (const sample of v.values) {
					const t = (sample.time as Date).getTime();
					const usageGiB = Number(sample.value) / BYTES_PER_GIB;
					const pct = limit ? (usageGiB / limit) * 100 : 0;
					const plotted = nextMode === 'percentage' ? pct : usageGiB;
					if (!dateMap[t]) dateMap[t] = { date: sample.time as Date };
					dateMap[t][pod] = plotted;
					if (!nextLookup[t]) nextLookup[t] = {};
					nextLookup[t][pod] = { usageGiB, pct };
					if (pct > (maxPctByPod[pod] ?? 0)) maxPctByPod[pod] = pct;
				}
			}

			mode = nextMode;
			pods = Object.keys(seenPods).sort();
			podInfo = Object.fromEntries(
				pods.map((p) => [p, { limitGiB: limitGiBByPod[p] ?? 0, maxPct: maxPctByPod[p] ?? 0 }])
			);
			lookup = nextLookup;
			data = Object.values(dateMap).sort(
				(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
			);
		} catch {
			data = [];
			pods = [];
			podInfo = {};
			lookup = {};
		}
	}

	function colorForMax(maxPct: number, paletteIndex: number): string {
		if (maxPct >= CRIT_PCT) return 'var(--destructive)';
		if (maxPct >= WARN_PCT) return 'var(--chart-1)';
		return POD_PALETTE[paletteIndex % POD_PALETTE.length];
	}

	const chartConfig = $derived.by<Chart.ChartConfig>(() => {
		const config: Chart.ChartConfig = {};
		pods.forEach((pod, i) => {
			const info = podInfo[pod];
			config[pod] = { label: pod, color: colorForMax(info?.maxPct ?? 0, i) };
		});
		return config;
	});

	const series = $derived(
		pods.map((pod) => ({
			key: pod,
			label: pod,
			color: (chartConfig[pod] as { color: string }).color
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
				{m.memory_usage_vs_limit()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{mode === 'percentage'
					? m.llm_dashboard_memory_usage_description()
					: m.llm_dashboard_memory_usage_no_limit_banner()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_memory_usage_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[260px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if data.length === 0 || pods.length === 0}
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
					yDomain={mode === 'percentage' ? [0, 100] : undefined}
					yPadding={mode === 'absolute' ? [0, 25] : undefined}
					{series}
					seriesLayout="overlap"
					props={{
						area: areaProps,
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`
						},
						yAxis: {
							format: (v: number) =>
								mode === 'percentage' ? `${v.toFixed(0)}%` : `${v.toFixed(0)}G`
						}
					}}
				>
					{#snippet marks({ context })}
						{#if mode === 'percentage'}
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
						{/if}
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
								{@const podKey = String(name)}
								{@const info = podInfo[podKey]}
								{@const sample =
									hoveredDateMs != null ? lookup[hoveredDateMs]?.[podKey] : undefined}
								{@const usageGiB = sample?.usageGiB ?? Number(value)}
								{@const pct = sample?.pct ?? 0}
								<div
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="mt-1 size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 flex-col gap-0.5 leading-tight">
									<span class="text-xs break-all text-muted-foreground" title={String(name)}>
										{name}
									</span>
									<span class="font-mono text-sm font-medium text-foreground tabular-nums">
										{#if mode === 'percentage'}
											{pct.toFixed(1)}%
											{#if info && info.limitGiB > 0}
												<span class="text-xs font-normal text-muted-foreground">
													({usageGiB.toFixed(2)} / {info.limitGiB.toFixed(0)} GiB)
												</span>
											{/if}
										{:else}
											{usageGiB.toFixed(2)} GiB
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
