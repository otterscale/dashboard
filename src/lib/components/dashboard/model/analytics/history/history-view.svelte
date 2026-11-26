<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount, untrack } from 'svelte';

	import {
		fetchInstant,
		fetchRange,
		rangeLiteral,
		scalar,
		stepFor
	} from '$lib/components/dashboard/kit/fetch';
	import { formatDuration } from '$lib/components/dashboard/kit/format';
	import HistoryChart, {
		type ChartPoint,
		type ChartSeries
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import SummaryStrip from '$lib/components/dashboard/kit/summary-strip.svelte';
	import { m } from '$lib/messages';
	import type { SharedMetrics } from '$lib/prometheus';

	import { fmtCount, fmtMillis, fmtPercent, fmtRate, fmtSeconds } from '../../overview/lib/models';
	import BGpuMemory from '../b-gpu-memory.svelte';
	import {
		CATEGORY_COLORS,
		DANGER,
		KV_DANGER,
		LIMIT,
		PAIR,
		PERCENTILE,
		RUNNING,
		WAITING
	} from '../lib/chart-style';
	import {
		bucketFor,
		finishBuckets,
		type FinishPoint,
		lengthGrid,
		line,
		mergeNamed,
		perPod,
		withLevel
	} from '../lib/history';
	import type { ModelPods } from '../lib/model-pods';
	import { fmtGiB } from '../lib/pods';
	import {
		activeQueries,
		cacheTierQueries,
		finishReasonQuery,
		genPerPodQuery,
		kvPerPodQuery,
		LATENCY,
		lengthHistogramQuery,
		memoryPerPodQueries,
		percentileQueries,
		prefillDecodeQueries,
		rateWindow,
		summaryQueries,
		throughputQueries
	} from '../lib/queries';
	import FinishReason from './finish-reason.svelte';
	import LengthHeatmap from './length-heatmap.svelte';

	// History: the window's summary, then four questions: is it slow, is it busy, why, and is the
	// hardware fine. Each chart loads on its own; a new window remounts the view.
	let {
		client,
		shared,
		modelKey,
		model,
		start,
		end
	}: {
		client: PrometheusDriver;
		shared: SharedMetrics;
		modelKey: string;
		model: ModelPods | undefined;
		start: Date;
		end: Date;
	} = $props();

	const step = $derived(stepFor(start, end));
	// Rates average over the gap between two points, so a long window skips no traffic.
	const rateSpan = $derived(rateWindow(step));
	type Chart = { data: ChartPoint[]; series: ChartSeries[] };
	const empty = (c: Chart) => c.data.length === 0;

	/** A chart from named single-series queries. */
	function named(queries: () => Record<string, string>, series: () => ChartSeries[]) {
		return new Loader<Chart>(async () => {
			const q = queries();
			const r = await fetchRange(client, q, start, end, step);
			if (!r) return null;
			return { data: mergeNamed(r, Object.keys(q)), series: series() };
		}, empty);
	}

	function percentiles(base: string) {
		return named(
			() => percentileQueries(modelKey, base, rateSpan),
			() => [
				line('p99', 'p99', PERCENTILE.p99),
				line('p95', 'p95', PERCENTILE.p95),
				line('mean', m.model_analytics_mean(), PERCENTILE.mean)
			]
		);
	}

	const summary = new Loader<Record<string, number | undefined>>(async () => {
		const r = await fetchInstant(
			client,
			summaryQueries(modelKey, rangeLiteral(start, end), step),
			end
		);
		if (!r) return null;
		return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, scalar(v)]));
	});

	const ttft = percentiles(LATENCY.ttft);
	const tpot = percentiles(LATENCY.tpot);
	const e2e = percentiles(LATENCY.e2e);
	const throughput = named(
		() => throughputQueries(modelKey, rateSpan),
		() => [
			line('prompt', m.model_analytics_prompt(), PAIR[0]),
			line('generation', m.model_analytics_generation(), PAIR[1])
		]
	);
	const active = named(
		() => activeQueries(modelKey),
		() => [line('running', m.running(), RUNNING), line('waiting', m.waiting(), WAITING)]
	);
	const prefill = named(
		() => prefillDecodeQueries(modelKey, rateSpan),
		() => [
			line('prefill', m.model_analytics_prefill(), PAIR[0]),
			line('decode', m.model_analytics_decode(), PAIR[1])
		]
	);
	const tiers = named(
		() => cacheTierQueries(modelKey, rateSpan),
		() => [
			{
				key: 'gpu',
				label: m.model_analytics_tier_gpu(),
				color: CATEGORY_COLORS[0],
				width: 1.5,
				style: 'line'
			},
			{
				key: 'cpu',
				label: m.model_analytics_tier_cpu(),
				color: CATEGORY_COLORS[1],
				width: 1.5,
				style: 'line'
			},
			{
				key: 'disk',
				label: m.model_analytics_tier_disk(),
				color: CATEGORY_COLORS[2],
				width: 1.5,
				style: 'line'
			},
			{
				key: 'p2p',
				label: m.model_analytics_tier_p2p(),
				color: CATEGORY_COLORS[3],
				width: 1.5,
				style: 'line'
			}
		]
	);

	function podLines(query: () => string, level?: { key: string; label: string; value: number }) {
		return new Loader<Chart>(async () => {
			const r = await fetchRange(client, { q: query() }, start, end, step);
			if (!r) return null;
			const { data, series } = perPod(r.q);
			if (!level || data.length === 0) return { data, series };
			return {
				data: withLevel(data, level.key, level.value),
				series: [...series, line(level.key, level.label, DANGER, true)]
			};
		}, empty);
	}
	const kv = podLines(() => kvPerPodQuery(modelKey), {
		key: 'danger',
		label: `${KV_DANGER}%`,
		value: KV_DANGER
	});
	const gen = podLines(() => genPerPodQuery(modelKey, rateSpan));

	const memory = new Loader<Chart & { limit?: number }>(async () => {
		const q = memoryPerPodQueries(modelKey, model?.container ?? 'main');
		const r = await fetchRange(client, q, start, end, step);
		if (!r) return null;
		const { data, series } = perPod(r.used);
		const limits = (r.limit[0]?.points ?? []).map((p) => p.v);
		const limit = limits.length ? Math.max(...limits) : undefined;
		if (limit === undefined || data.length === 0) return { data, series };
		return {
			data: withLevel(data, 'limit', limit),
			series: [...series, line('limit', m.model_analytics_limit(), LIMIT)],
			limit
		};
	}, empty);

	const finishBucket = $derived(bucketFor(start, end, 12, 300));
	const finish = new Loader<FinishPoint[]>(
		async () => {
			const r = await fetchRange(
				client,
				{ q: finishReasonQuery(modelKey, finishBucket) },
				new Date(start.getTime() + finishBucket * 1000),
				end,
				finishBucket
			);
			if (!r) return null;
			return finishBuckets(r.q, finishBucket);
		},
		(d) => d.every((p) => p.stop + p.length + p.aborted === 0)
	);

	const heatBucket = $derived(bucketFor(start, end, 36, 60));
	function heatmap(bucket: string) {
		return new Loader<ReturnType<typeof lengthGrid>>(
			async () => {
				const r = await fetchRange(
					client,
					{ q: lengthHistogramQuery(modelKey, bucket, heatBucket) },
					new Date(start.getTime() + heatBucket * 1000),
					end,
					heatBucket
				);
				if (!r) return null;
				return lengthGrid(r.q);
			},
			(g) => g.counts.flat().every((c) => c === 0)
		);
	}
	const promptLength = heatmap('vllm:request_prompt_tokens_bucket');
	const generationLength = heatmap('vllm:request_generation_tokens_bucket');

	onMount(() => {
		for (const l of [
			summary,
			ttft,
			tpot,
			e2e,
			throughput,
			active,
			kv,
			prefill,
			tiers,
			gen,
			finish,
			promptLength,
			generationLength
		]) {
			void l.load();
		}
	});
	// Memory needs the engine container's name, which comes with the pod list.
	$effect(() => {
		if (model) untrack(() => void memory.load());
	});

	const s = $derived(summary.data ?? {});
	const items = $derived([
		{
			label: m.model_analytics_rps(),
			value: fmtRate(s.rpsAvg),
			note: m.model_analytics_avg_peak({ peak: fmtRate(s.rpsPeak) })
		},
		{
			label: m.model_analytics_waiting_requests(),
			value: fmtCount(s.waitingPeak),
			note: m.model_analytics_peak_preemptions({ count: fmtCount(s.preemptions ?? 0) })
		},
		{
			label: m.model_analytics_ttft_p95(),
			value: fmtSeconds(s.ttft),
			note: m.model_analytics_over_range()
		},
		{
			label: m.model_analytics_tpot_p95(),
			value: fmtMillis(s.tpot),
			note: m.model_analytics_over_range()
		},
		{
			label: m.model_analytics_e2e_p95(),
			value: fmtSeconds(s.e2e),
			note: m.model_analytics_over_range()
		}
	]);

	const tokens = (v: number) => fmtRate(v);
	const count = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
	const gib = (v: number) => `${fmtGiB(v)} GiB`;
	const H = 180;
</script>

{#snippet section(title: string)}
	<h3 class="pt-4 text-sm leading-5 font-[550]">{title}</h3>
{/snippet}

<div class="flex flex-col gap-2 @md:gap-3">
	<SummaryStrip {items} state={summary.state === 'empty' ? 'ready' : summary.state} />

	{@render section(m.model_analytics_is_slow())}
	<div class="grid grid-cols-1 gap-2 @md:gap-3 @5xl:grid-cols-3">
		<HistoryChart
			title={m.model_analytics_ttft()}
			data={ttft.data?.data ?? []}
			series={ttft.data?.series ?? []}
			format={fmtSeconds}
			state={ttft.state}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_tpot()}
			data={tpot.data?.data ?? []}
			series={tpot.data?.series ?? []}
			format={fmtMillis}
			state={tpot.state}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_e2e()}
			data={e2e.data?.data ?? []}
			series={e2e.data?.series ?? []}
			format={fmtSeconds}
			state={e2e.state}
			height={H}
		/>
	</div>

	{@render section(m.model_analytics_is_busy())}
	<div class="grid grid-cols-1 gap-2 @md:gap-3 @5xl:grid-cols-3">
		<HistoryChart
			title={m.model_analytics_token_throughput()}
			peak={m.model_analytics_tokens_per_second()}
			data={throughput.data?.data ?? []}
			series={throughput.data?.series ?? []}
			format={tokens}
			state={throughput.state}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_active_requests()}
			data={active.data?.data ?? []}
			series={active.data?.series ?? []}
			format={count}
			state={active.state}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_kv_per_pod()}
			data={kv.data?.data ?? []}
			series={kv.data?.series ?? []}
			format={fmtPercent}
			state={kv.state}
			yMax={100}
			height={H}
		/>
	</div>

	{@render section(m.model_analytics_why())}
	<div class="grid grid-cols-1 gap-2 @md:gap-3 @5xl:grid-cols-3">
		<HistoryChart
			title={m.model_analytics_prefill_decode()}
			peak={m.model_analytics_p95_per_request()}
			data={prefill.data?.data ?? []}
			series={prefill.data?.series ?? []}
			format={fmtSeconds}
			state={prefill.state}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_cache_tiers()}
			data={tiers.data?.data ?? []}
			series={tiers.data?.series ?? []}
			format={fmtPercent}
			state={tiers.state}
			yMax={100}
			height={H}
		/>
		<HistoryChart
			title={m.model_analytics_gen_per_replica()}
			data={gen.data?.data ?? []}
			series={gen.data?.series ?? []}
			format={tokens}
			state={gen.state}
			height={H}
		/>
		<FinishReason
			data={finish.data ?? []}
			state={finish.state}
			bucket={formatDuration(finishBucket)}
			height={H}
		/>
		<LengthHeatmap
			title={m.model_analytics_prompt_length()}
			grid={promptLength.data ?? { bins: [], times: [], counts: [] }}
			state={promptLength.state}
			height={H}
		/>
		<LengthHeatmap
			title={m.model_analytics_generation_length()}
			grid={generationLength.data ?? { bins: [], times: [], counts: [] }}
			state={generationLength.state}
			height={H}
		/>
	</div>

	{@render section(m.model_analytics_is_hardware_fine())}
	<div class="grid grid-cols-1 gap-2 @md:gap-3 @5xl:grid-cols-2">
		<HistoryChart
			title={m.model_analytics_memory_per_pod()}
			peak={memory.data?.limit !== undefined
				? m.model_analytics_limit_value({ value: gib(memory.data.limit) })
				: undefined}
			data={memory.data?.data ?? []}
			series={memory.data?.series ?? []}
			format={gib}
			state={model ? memory.state : 'loading'}
			height={H}
		/>
		<BGpuMemory {shared} {model} {start} {end} />
	</div>
</div>
