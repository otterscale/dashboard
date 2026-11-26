<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import {
		fetchInstant,
		fetchRange,
		rangeLiteral,
		stats,
		stepFor,
		toPoints
	} from '$lib/components/dashboard/kit/fetch';
	import { DASH, fmt, fmtPct, fmtRate, splitRate } from '$lib/components/dashboard/kit/format';
	import HistoryChart, {
		type ChartPoint
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import SummaryStrip from '$lib/components/dashboard/kit/summary-strip.svelte';
	import { m } from '$lib/messages';

	import { nodeHistoryQueries, restartsByNode } from '../lib/promql';
	import type { WorkspacePalette } from '../lib/workspaces';
	import GpuRows from './gpu-rows.svelte';
	import RestartsCard from './restarts-card.svelte';

	let {
		client,
		node,
		instance,
		hasGpu,
		start,
		end,
		windowLabel,
		palette
	}: {
		client: PrometheusDriver;
		/** Left out while the page has no node yet: the cards then wait in their loading state. */
		node: string | undefined;
		instance: string | undefined;
		hasGpu: boolean;
		start: Date;
		end: Date;
		windowLabel: string;
		palette: WorkspacePalette;
	} = $props();

	type Data = {
		cpu: ChartPoint[];
		memory: ChartPoint[];
		network: ChartPoint[];
		disk: ChartPoint[];
		summary: Record<string, { avg?: number; peak?: number }>;
		restarts?: number;
	};

	const loader = new Loader<Data>(async () => {
		if (!node) return null;
		const [r, restarts] = await Promise.all([
			fetchRange(client, nodeHistoryQueries(node, instance), start, end, stepFor(start, end, 90)),
			fetchInstant(client, { restarts: restartsByNode(rangeLiteral(start, end)) }, end)
		]);
		if (!r) return null;
		const withAllocatable = (points: ChartPoint[]) => points.map((p) => ({ ...p, alloc: 100 }));
		const net = toPoints(r, ['netRx', 'netTx']);
		return {
			cpu: withAllocatable(toPoints(r, ['cpuUse', 'cpuReq', 'cpuLim'])),
			memory: withAllocatable(toPoints(r, ['memUse', 'memReq', 'memLim'])),
			network: net,
			disk: toPoints(r, ['diskRead', 'diskWrite']),
			summary: {
				cpuUse: stats(r.cpuUse[0]),
				cpuReq: stats(r.cpuReq[0]),
				memUse: stats(r.memUse[0]),
				memReq: stats(r.memReq[0]),
				gpuUtil: stats(r.gpuUtil[0]),
				netRx: stats(r.netRx?.[0]),
				netTx: stats(r.netTx?.[0]),
				diskRead: stats(r.diskRead?.[0]),
				diskWrite: stats(r.diskWrite?.[0]),
				net: {
					peak: net.length
						? Math.max(...net.map((p) => Number(p.netRx ?? 0) + Number(p.netTx ?? 0)))
						: undefined
				}
			},
			restarts:
				restarts?.restarts.find((s) => s.labels.node === node)?.value ?? (restarts ? 0 : undefined)
		};
	});

	// A new window starts from the loading cards; the page remounts this for a new node.
	$effect(() => {
		void [start.getTime(), end.getTime()];
		if (!node) return;
		untrack(() => {
			loader.reset();
			loader.load();
		});
	});

	const s = $derived(loader.data?.summary ?? {});
	const net = $derived(splitRate(s.net?.peak));
	const pct = (v: number) => `${fmt(v)}%`;
	const items = $derived([
		{
			label: m.analytics_cpu_usage(),
			value: fmtPct(s.cpuUse?.avg),
			note: m.analytics_avg_peak({ peak: fmtPct(s.cpuUse?.peak) })
		},
		{
			label: m.analytics_memory_usage(),
			value: fmtPct(s.memUse?.avg),
			note: m.analytics_avg_peak({ peak: fmtPct(s.memUse?.peak) })
		},
		{
			label: m.analytics_gpu_utilization(),
			value: hasGpu ? fmtPct(s.gpuUtil?.avg) : DASH,
			note: hasGpu
				? m.analytics_avg_peak({ peak: fmtPct(s.gpuUtil?.peak) })
				: m.analytics_no_gpus_on_node()
		},
		{
			label: m.analytics_pod_restarts(),
			value: fmt(loader.data?.restarts),
			note: m.analytics_in_the_last({ window: windowLabel })
		},
		{
			label: m.analytics_network(),
			value: net.value,
			note: m.analytics_unit_peak({ unit: net.unit })
		}
	]);
</script>

<SummaryStrip {items} state={loader.state} />

<div class="grid gap-2 @md:gap-3 @4xl:grid-cols-2">
	<HistoryChart
		title={m.analytics_cpu_commitment()}
		peak={m.analytics_peak_usage_request({
			usage: fmtPct(s.cpuUse?.peak),
			request: fmtPct(s.cpuReq?.peak)
		})}
		data={loader.data?.cpu ?? []}
		state={loader.state}
		format={pct}
		yMax={100}
		series={[
			{ key: 'cpuUse', label: m.analytics_usage(), style: 'area' },
			{ key: 'cpuReq', label: m.analytics_request(), style: 'line', color: 'var(--chart-4)' },
			{ key: 'cpuLim', label: m.analytics_limit(), style: 'dashed', color: 'var(--chart-4)' },
			{ key: 'alloc', label: m.analytics_allocatable(), style: 'dotted', color: 'var(--chart-4)' }
		]}
	/>
	<HistoryChart
		title={m.analytics_memory_commitment()}
		peak={m.analytics_peak_usage_request({
			usage: fmtPct(s.memUse?.peak),
			request: fmtPct(s.memReq?.peak)
		})}
		data={loader.data?.memory ?? []}
		state={loader.state}
		format={pct}
		yMax={100}
		series={[
			{ key: 'memUse', label: m.analytics_usage(), style: 'area' },
			{ key: 'memReq', label: m.analytics_request(), style: 'line', color: 'var(--chart-4)' },
			{ key: 'memLim', label: m.analytics_limit(), style: 'dashed', color: 'var(--chart-4)' },
			{ key: 'alloc', label: m.analytics_allocatable(), style: 'dotted', color: 'var(--chart-4)' }
		]}
	/>
	<HistoryChart
		title={m.analytics_network()}
		peak={m.analytics_peak({ value: fmtRate(s.netRx?.peak) })}
		data={loader.data?.network ?? []}
		state={node && !instance ? 'empty' : loader.state}
		format={fmtRate}
		series={[
			{ key: 'netRx', label: m.analytics_received(), style: 'area' },
			{ key: 'netTx', label: m.analytics_transmitted(), style: 'dashed', color: 'var(--chart-4)' }
		]}
	/>
	<HistoryChart
		title={m.analytics_disk()}
		peak={m.analytics_peak({
			value: fmtRate(Math.max(s.diskRead?.peak ?? 0, s.diskWrite?.peak ?? 0))
		})}
		data={loader.data?.disk ?? []}
		state={node && !instance ? 'empty' : loader.state}
		format={fmtRate}
		series={[
			{ key: 'diskRead', label: m.analytics_read(), style: 'area' },
			{ key: 'diskWrite', label: m.analytics_write(), style: 'dashed', color: 'var(--chart-4)' }
		]}
	/>
</div>

{#if hasGpu && node}
	<GpuRows {client} {node} {start} {end} {windowLabel} />
{/if}

<RestartsCard
	{client}
	scope={node ? { node } : undefined}
	{start}
	{end}
	{windowLabel}
	describe={(pod) => {
		const ws = palette.workspaceOf(pod.namespace);
		return ws ? `${ws} · ${pod.namespace}` : pod.namespace;
	}}
/>
