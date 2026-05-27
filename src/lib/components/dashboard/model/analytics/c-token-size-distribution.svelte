<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { Axis, Cell, Chart as LayerChart, Svg, Tooltip as LayerTooltip } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import {
		computeStep,
		type DataPoint,
		fetchFlattenedRange,
		vllmMetricWithSelector
	} from '$lib/prometheus';

	let {
		title,
		description,
		tooltip,
		bucketMetric,
		prometheusDriver,
		namespace,
		selectedModel,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		title: string;
		description: string;
		tooltip: string;
		bucketMetric: string;
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	let rawData = $state<DataPoint[]>([]);
	let isLoaded = $state(false);

	function getQuery(): string {
		const bucket = vllmMetricWithSelector(bucketMetric, namespace, selectedModel);
		return `sum by(le) (rate(${bucket}[5m]))`;
	}

	const HEATMAP_MAX_BINS = 12;
	const HEATMAP_MIN_STEP_SEC = 300;

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			rawData = await fetchFlattenedRange(
				prometheusDriver,
				getQuery(),
				new Date(startMs),
				new Date(endMs),
				computeStep(startMs, endMs, HEATMAP_MIN_STEP_SEC, HEATMAP_MAX_BINS)
			);
		} catch {
			rawData = [];
		}
	}

	const reloadManager = new ReloadManager(fetch);
	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());
	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	type Bucket = { key: string; label: string };

	function fmtNum(n: number): string {
		if (!Number.isFinite(n)) return '∞';
		if (n === 0) return '0';
		const abs = Math.abs(n);
		if (abs >= 1_000_000) {
			const v = n / 1_000_000;
			return Number.isInteger(v) ? `${v}M` : `${v.toFixed(1)}M`;
		}
		if (abs >= 1_000) {
			const v = n / 1_000;
			return Number.isInteger(v) ? `${v}K` : `${v.toFixed(1)}K`;
		}
		return Number.isInteger(n) ? `${n}` : n.toFixed(1);
	}

	const MIN_VISIBLE_LE = 20;

	const sortedBuckets = $derived.by<Bucket[]>(() => {
		if (rawData.length === 0) return [];
		const keys = Object.keys(rawData[0]).filter((k) => k !== 'date');
		const sorted = keys
			.map((k) => ({ k, n: k === '+Inf' ? Number.POSITIVE_INFINITY : Number(k) }))
			.filter((x) => Number.isFinite(x.n) || x.k === '+Inf')
			.sort((a, b) => a.n - b.n)
			.filter(({ n }) => n === Number.POSITIVE_INFINITY || n >= MIN_VISIBLE_LE);
		const buckets: Bucket[] = [];
		let prevN = 0;
		sorted.forEach(({ k, n }) => {
			const label =
				n === Number.POSITIVE_INFINITY ? `> ${fmtNum(prevN)}` : `${fmtNum(prevN)}–${fmtNum(n)}`;
			buckets.push({ key: k, label });
			prevN = n;
		});
		return buckets;
	});

	type HeatCell = {
		date: Date;
		dateKey: string;
		bucketKey: string;
		bucketLabel: string;
		value: number;
	};

	const cells = $derived.by<HeatCell[]>(() => {
		if (sortedBuckets.length === 0) return [];
		const out: HeatCell[] = [];
		for (const point of rawData) {
			const date = point.date as Date;
			const dateKey = date.toISOString();
			let prevCumulative = 0;
			for (const b of sortedBuckets) {
				const cumulative = Number(point[b.key] ?? 0);
				const delta = Number.isFinite(cumulative) ? Math.max(0, cumulative - prevCumulative) : 0;
				out.push({
					date,
					dateKey,
					bucketKey: b.key,
					bucketLabel: b.label,
					value: delta
				});
				if (Number.isFinite(cumulative)) prevCumulative = cumulative;
			}
		}
		return out;
	});

	const maxValue = $derived(cells.reduce((mx, c) => Math.max(mx, c.value), 0));
	const opacityScale = $derived(
		scaleLinear()
			.domain([0, maxValue || 1])
			.range([0.05, 1])
	);

	const xDomain = $derived(rawData.map((p) => (p.date as Date).toISOString()));
	const yDomain = $derived(sortedBuckets.map((b) => b.label));
	const hasData = $derived(cells.some((c) => c.value > 0));

	const cellLookup = $derived.by(() => {
		const map = new SvelteMap<string, HeatCell>();
		for (const c of cells) map.set(`${c.dateKey}|${c.bucketLabel}`, c);
		return map;
	});

	function timeLabel(v: Date): string {
		return `${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`;
	}

	type BandLike = { domain(): string[]; range(): [number, number] };
	function invertBand(scale: BandLike, px: number): string | undefined {
		const domain = scale.domain();
		const [r0, r1] = scale.range();
		if (r0 === r1 || domain.length === 0) return undefined;
		const fraction = (px - r0) / (r1 - r0);
		if (fraction < 0 || fraction > 1) return undefined;
		const i = Math.min(domain.length - 1, Math.max(0, Math.floor(fraction * domain.length)));
		return domain[i];
	}

	const chartConfig = {
		rate: { label: m.per_second(), color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{title}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if !hasData || sortedBuckets.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="h-[200px] w-full">
				<LayerChart
					data={cells}
					x="dateKey"
					xScale={scaleBand().padding(0.02)}
					{xDomain}
					y="bucketLabel"
					yScale={scaleBand().padding(0.05)}
					{yDomain}
					padding={{ left: 56, bottom: 22, top: 4, right: 8 }}
				>
					{#snippet children({ context })}
						<LayerTooltip.Context mode="manual">
							<Svg>
								<Axis
									placement="left"
									tickLength={0}
									rule={false}
									labelProps={{ class: 'text-[10px] fill-muted-foreground' }}
								/>
								<Axis
									placement="bottom"
									tickLength={0}
									rule={false}
									format={(v: string) => timeLabel(new Date(v))}
									labelProps={{ class: 'text-[10px] fill-muted-foreground' }}
								/>
								<g
									role="presentation"
									onpointermove={(e: PointerEvent) => {
										const target = e.currentTarget as SVGGElement;
										const bbox = target.getBoundingClientRect();
										const px = e.clientX - bbox.left;
										const py = e.clientY - bbox.top;
										const dateKey = invertBand(context.xScale as unknown as BandLike, px);
										const bucketLabel = invertBand(context.yScale as unknown as BandLike, py);
										if (dateKey == null || bucketLabel == null) {
											context.tooltip.hide();
											return;
										}
										const cell = cellLookup.get(`${dateKey}|${bucketLabel}`);
										if (!cell) {
											context.tooltip.hide();
											return;
										}
										context.tooltip.show(e, cell);
										context.tooltip.series = [
											{
												key: 'rate',
												label: `${cell.bucketLabel} tokens`,
												value: cell.value,
												color: 'var(--color-rate)',
												visible: true,
												// eslint-disable-next-line @typescript-eslint/no-explicit-any
												config: {} as any
											}
										];
									}}
									onpointerleave={() => context.tooltip.hide()}
								>
									<Cell
										x="dateKey"
										y="bucketLabel"
										class="fill-chart-1"
										fillOpacity={(d: HeatCell) => (d.value > 0 ? opacityScale(d.value) : 0.02)}
									/>
								</g>
							</Svg>
							<Chart.Tooltip
								indicator="dot"
								labelFormatter={(v: string) =>
									new Date(v).toLocaleDateString('en-US', {
										year: 'numeric',
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: 'numeric'
									})}
							>
								{#snippet formatter({ item, name, value })}
									<div
										style="--color-bg: {item.color}; --color-border: {item.color};"
										class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
									></div>
									<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
										<div class="grid gap-1.5">
											<span class="text-muted-foreground">{name}</span>
										</div>
										<span class="font-mono font-medium tabular-nums text-foreground">
											{Number(value).toFixed(2)}/{m.per_second()}
										</span>
									</div>
								{/snippet}
							</Chart.Tooltip>
						</LayerTooltip.Context>
					{/snippet}
				</LayerChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>
