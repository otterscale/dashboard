<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleBand } from 'd3-scale';
	import {
		Axis,
		Canvas,
		Cell,
		Chart as LayerChart,
		Svg,
		Tooltip as LayerTooltip
	} from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatChartTimeRange, formatChartXAxisDate } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import {
		computeStep,
		type DataPoint,
		dcgmNodeSelector,
		fetchFlattenedRange
	} from '$lib/prometheus';

	// Per-card GPU heatmap: one row per GPU, one column per time bin, colour depth = value.
	// Like c-token-size-distribution.svelte's band×band grid, but cells on a Canvas layer.
	let {
		client,
		// k8s node name == DCGM `Hostname` (see dcgmNodeSelector in prometheus.ts).
		nodeName,
		metric,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		nodeName: string;
		metric: 'util' | 'memory' | 'power' | 'temp';
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const hostFilter = $derived(dcgmNodeSelector(nodeName));

	// `token` is the theme chart var the cell ramp mixes up to (see cellFill); theme tokens
	// stay on-palette and flip with light/dark. All four share --chart-2 to read as one
	// group — swap an individual `token` to give a metric its own hue.
	// `max by(gpu)` collapses DCGM's extra labels to one series per card index, so
	// fetchFlattenedRange keys each row by the bare index "0"…"N".
	const config = $derived.by(() => {
		switch (metric) {
			case 'util':
				return {
					title: m.gpu_utilization(),
					description: m.node_chart_gpu_util_description(),
					tooltip: m.node_chart_gpu_util_tooltip(),
					query: `max by(gpu) (DCGM_FI_DEV_GPU_UTIL{${hostFilter}})`,
					// Saturation metrics colour against the full 0–100% scale so "dark = full".
					fixedMax: 100,
					format: (v: number) => `${v.toFixed(0)}%`,
					token: 'var(--chart-2)'
				};
			case 'memory':
				return {
					title: m.gpu_memory(),
					description: m.node_chart_gpu_memory_description(),
					tooltip: m.node_chart_gpu_memory_tooltip(),
					query:
						`100 * max by(gpu) (DCGM_FI_DEV_FB_USED{${hostFilter}}) / ` +
						`(max by(gpu) (DCGM_FI_DEV_FB_USED{${hostFilter}}) + max by(gpu) (DCGM_FI_DEV_FB_FREE{${hostFilter}}))`,
					fixedMax: 100,
					format: (v: number) => `${v.toFixed(0)}%`,
					token: 'var(--chart-2)'
				};
			case 'power':
				return {
					title: m.gpu_power(),
					description: m.node_chart_gpu_power_description(),
					tooltip: m.node_chart_gpu_power_tooltip(),
					query: `max by(gpu) (DCGM_FI_DEV_POWER_USAGE{${hostFilter}})`,
					// Open-ended metrics colour against the observed maximum instead.
					fixedMax: undefined,
					format: (v: number) => `${v.toFixed(0)} W`,
					token: 'var(--chart-2)'
				};
			case 'temp':
				return {
					title: m.gpu_temperature(),
					description: m.node_chart_gpu_temp_description(),
					tooltip: m.node_chart_gpu_temp_tooltip(),
					query: `max by(gpu) (DCGM_FI_DEV_GPU_TEMP{${hostFilter}})`,
					fixedMax: undefined,
					format: (v: number) => `${v.toFixed(0)}°C`,
					token: 'var(--chart-2)'
				};
		}
	});

	// 48 bins: fine enough to catch short per-card dips, wide enough to hover.
	const HEATMAP_MIN_STEP_SEC = 60;
	const HEATMAP_MAX_BINS = 48;

	let rawData = $state<DataPoint[]>([]);
	let isLoaded = $state(false);

	// Skip the `rawData` swap (and the whole derived chain + canvas redraw) when a reload
	// tick returns identical data — common on fixed time windows.
	let lastSignature = '';
	// Mount fires fetch twice (onMount + the reload $effect's immediate tick); dedupe them.
	let inFlight = false;

	async function fetch() {
		if (inFlight) return;
		inFlight = true;
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const next = await fetchFlattenedRange(
				client,
				config.query,
				new Date(startMs),
				new Date(endMs),
				computeStep(startMs, endMs, HEATMAP_MIN_STEP_SEC, HEATMAP_MAX_BINS)
			);
			const signature = next
				.map((p) =>
					Object.entries(p)
						.map(([k, v]) => (k === 'date' ? (v as Date).getTime() : v))
						.join(',')
				)
				.join(';');
			if (signature !== lastSignature) {
				lastSignature = signature;
				rawData = next;
			}
		} catch {
			lastSignature = '';
			rawData = [];
		} finally {
			inFlight = false;
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

	// GPU indices arrive as bare strings; sort numerically so GPU 10 follows GPU 9, not GPU 1.
	const gpuKeys = $derived.by(() => {
		const keys = new SvelteSet<string>();
		for (const point of rawData) {
			for (const k of Object.keys(point)) if (k !== 'date') keys.add(k);
		}
		return [...keys].sort((a, b) => Number(a) - Number(b));
	});

	type HeatCell = {
		dateKey: string;
		gpuLabel: string;
		value: number | null;
	};

	const cells = $derived.by<HeatCell[]>(() => {
		const out: HeatCell[] = [];
		for (const point of rawData) {
			const dateKey = (point.date as Date).toISOString();
			for (const k of gpuKeys) {
				const raw = Number(point[k]);
				out.push({
					dateKey,
					gpuLabel: `GPU ${k}`,
					value: Number.isFinite(raw) ? raw : null
				});
			}
		}
		return out;
	});

	const maxValue = $derived(
		config.fixedMax ?? cells.reduce((mx, c) => Math.max(mx, c.value ?? 0), 0)
	);

	// Cell fill ramps from --card (value 0) up to the metric token. OKLAB, not OKLCH:
	// --card is achromatic, so a polar mix would rotate mid cells through blue/purple.
	// Must reference CSS vars — layerchart's canvas only resolves a fill via getComputedStyle
	// when it contains `var(`. Quantising to 20 levels caps that resolve cache per chart.
	const COLOR_LEVELS = 20;
	const EMPTY_FILL = 'color-mix(in oklab, var(--muted) 50%, transparent)';
	function cellFill(d: HeatCell): string {
		if (d.value === null) return EMPTY_FILL;
		const t = Math.min(1, Math.max(0, d.value / (maxValue || 1)));
		const pct = Math.round((Math.round(t * COLOR_LEVELS) / COLOR_LEVELS) * 100);
		return `color-mix(in oklab, ${config.token} ${pct}%, var(--card))`;
	}

	const xDomain = $derived(rawData.map((p) => (p.date as Date).toISOString()));
	const yDomain = $derived(gpuKeys.map((k) => `GPU ${k}`));
	const hasData = $derived(cells.some((c) => c.value !== null));

	const cellLookup = $derived.by(() => {
		const map = new SvelteMap<string, HeatCell>();
		for (const c of cells) map.set(`${c.dateKey}|${c.gpuLabel}`, c);
		return map;
	});

	// Range-aware tick formatting, matching the other dashboard charts.
	const effectiveEnd = $derived(endIsNow ? new Date() : end);
	const chartTimeRange = $derived(
		formatChartTimeRange((effectiveEnd.getTime() - start.getTime()) / 3_600_000)
	);

	// Label ~6 evenly spaced columns; blank the rest so 48 bands don't flood the axis.
	const xLabelEvery = $derived(Math.max(1, Math.ceil(xDomain.length / 6)));
	function xTickFormat(v: string): string {
		const i = xDomain.indexOf(v);
		return i % xLabelEvery === 0 ? formatChartXAxisDate(new Date(v), chartTimeRange) : '';
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

	// Hover bookkeeping — plain lets (read only in the handlers, never the template, so they
	// must not be reactive). getBoundingClientRect forces a layout pass, so cache it ~150ms
	// and only touch the tooltip when the pointer crosses into a different cell.
	let hoverRect: DOMRect | null = null;
	let hoverRectAt = 0;
	let hoverKey: string | null = null;

	function plotRect(target: SVGGraphicsElement): DOMRect {
		const now = performance.now();
		if (!hoverRect || now - hoverRectAt > 150) {
			hoverRect = target.getBoundingClientRect();
			hoverRectAt = now;
		}
		return hoverRect;
	}

	const chartConfig = $derived({
		value: { label: config.title, color: config.token }
	} satisfies Chart.ChartConfig);
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{config.title}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">{config.description}</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{config.tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if !hasData}
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
					y="gpuLabel"
					yScale={scaleBand().padding(0.15)}
					{yDomain}
					padding={{ left: 48, bottom: 22, top: 4, right: 8 }}
				>
					{#snippet children({ context })}
						<LayerTooltip.Context mode="manual">
							<!-- One canvas node for all cells (vs one <rect> each) keeps the mount cheap. -->
							<Canvas>
								<Cell x="dateKey" y="gpuLabel" fill={cellFill} />
							</Canvas>
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
									format={xTickFormat}
									labelProps={{ class: 'text-[10px] fill-muted-foreground' }}
								/>
								<!-- Transparent hit target — the canvas cells can't receive pointer events. -->
								<rect
									role="presentation"
									x={0}
									y={0}
									width={context.width}
									height={context.height}
									fill="transparent"
									onpointermove={(e) => {
										const bbox = plotRect(e.currentTarget);
										const px = e.clientX - bbox.left;
										const py = e.clientY - bbox.top;
										const dateKey = invertBand(context.xScale as unknown as BandLike, px);
										const gpuLabel = invertBand(context.yScale as unknown as BandLike, py);
										if (dateKey == null || gpuLabel == null) {
											hoverKey = null;
											context.tooltip.hide();
											return;
										}
										const key = `${dateKey}|${gpuLabel}`;
										// Still inside the same cell — the visible tooltip is already correct.
										if (key === hoverKey) return;
										const cell = cellLookup.get(key);
										if (!cell || cell.value === null) {
											hoverKey = null;
											context.tooltip.hide();
											return;
										}
										hoverKey = key;
										context.tooltip.show(e, cell);
										context.tooltip.series = [
											{
												key: 'value',
												label: cell.gpuLabel,
												value: cell.value,
												color: 'var(--color-value)',
												visible: true,
												// eslint-disable-next-line @typescript-eslint/no-explicit-any
												config: {} as any
											}
										];
									}}
									onpointerleave={() => {
										hoverKey = null;
										hoverRect = null;
										context.tooltip.hide();
									}}
								/>
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
										<span class="font-mono font-medium text-foreground tabular-nums">
											{config.format(Number(value))}
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
