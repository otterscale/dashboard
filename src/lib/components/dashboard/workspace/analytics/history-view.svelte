<script lang="ts">
	import HistoryChart, {
		type ChartSeries
	} from '$lib/components/dashboard/cluster/analytics/history/history-chart.svelte';
	import SummaryStrip from '$lib/components/dashboard/cluster/analytics/history/summary-strip.svelte';
	import type { Series } from '$lib/components/dashboard/cluster/analytics/lib/fetch';
	import {
		DASH,
		fmt,
		fmtCores,
		fmtGiB,
		fmtPct,
		GIB
	} from '$lib/components/dashboard/cluster/analytics/lib/format';
	import {
		OTHER_COLOR,
		WORKSPACE_COLORS
	} from '$lib/components/dashboard/cluster/analytics/lib/workspaces';
	import type { WidgetState } from '$lib/components/dashboard/kit';
	import HourlyChart, {
		type BarPoint
	} from '$lib/components/dashboard/model/usage/hourly-chart.svelte';
	import { m } from '$lib/messages';

	import {
		chartRows,
		colourSlots,
		type HistoryLines,
		type Line,
		lineStats,
		mergeLines,
		OTHER,
		type Quota,
		requestedUnused,
		type Totals
	} from './lib/model';

	// History: five numbers for the window, then one chart per resource. There is no GPU chart:
	// GPU numbers come from the shared scope, which has no history. Lines share one y axis
	// per chart; a level that is not usage (request, limit, quota) is thinner, dashed or dotted.
	let {
		wholeWorkspace,
		lines,
		totals,
		quota,
		restartBars,
		bucketSeconds,
		volumes,
		windowLabel,
		usageState,
		gpuState,
		restartsState,
		volumesState,
		podsState
	}: {
		wholeWorkspace: boolean;
		/** The selected row's lines. */
		lines: HistoryLines;
		totals: Totals | undefined;
		quota: Quota;
		restartBars: BarPoint[];
		bucketSeconds: number;
		/** Fill percentage per volume the selected row mounts. */
		volumes: Series[];
		windowLabel: string;
		usageState: WidgetState;
		gpuState: WidgetState;
		restartsState: WidgetState;
		volumesState: WidgetState;
		podsState: WidgetState;
	} = $props();

	const cpuUse = $derived(lineStats(lines.cpuUse));
	const memUse = $derived(lineStats(lines.memUse));
	const gpu = $derived(totals?.gpu);
	const unusedCpu = $derived(requestedUnused(cpuUse.avg, lineStats(lines.cpuReq).avg));
	const unusedMemory = $derived(requestedUnused(memUse.avg, lineStats(lines.memReq).avg));

	// The strip is one card, so it waits for the slowest of its numbers.
	const stripState = $derived<WidgetState>(
		usageState === 'error'
			? 'error'
			: [usageState, gpuState, podsState].includes('loading')
				? 'loading'
				: 'ready'
	);
	const items = $derived([
		{
			label: m.ws_analytics_cpu_used(),
			value: `${fmtCores(cpuUse.avg)} ${m.analytics_unit_cores()}`,
			note: m.ws_analytics_average_peak({ peak: fmtCores(cpuUse.peak) })
		},
		{
			label: m.analytics_memory_used(),
			value: `${fmtGiB(memUse.avg)} ${m.analytics_unit_gib()}`,
			note: m.ws_analytics_average_requested({ requested: fmtGiB(totals?.memory.requested) })
		},
		{
			label: m.analytics_gpu_utilization(),
			// The shared scope answers for the present only, so this is not an average.
			value: gpu ? fmtPct(gpu.util) : DASH,
			note: gpu
				? m.ws_analytics_gpu_now_only()
				: wholeWorkspace
					? m.analytics_no_gpu_workloads()
					: m.analytics_no_gpu()
		},
		{
			label: m.analytics_restarts(),
			value: fmt(totals?.restarts ?? 0),
			valueClass: (totals?.restarts ?? 0) > 0 ? 'text-chart-1' : undefined,
			note: m.analytics_in_the_last({ window: windowLabel })
		},
		{
			label: m.ws_analytics_unused(),
			value: unusedCpu === undefined ? DASH : m.ws_analytics_unused_cpu({ pct: fmtPct(unusedCpu) }),
			note:
				unusedMemory === undefined
					? m.ws_analytics_unused_none()
					: m.ws_analytics_unused_memory({ pct: fmtPct(unusedMemory) })
		}
	]);

	// The card's subtitle names the unit, so the axis and the tooltip carry the number alone, and
	// zero is a plain 0 that leaves room for the first time label beside it.
	const cores = (v: number) => (v === 0 ? '0' : fmtCores(v));
	const gib = (v: number) => (v === 0 ? '0' : fmt(v, v < 10 ? 1 : 0));
	const percent = (v: number) => `${fmt(v)}%`;

	const USED = { style: 'area', width: 2 } as const;
	const REQUESTED = { style: 'line', color: 'var(--chart-4)' } as const;
	const LIMIT = { style: 'dashed', color: 'var(--chart-4)' } as const;
	const QUOTA = { style: 'dotted', color: 'var(--chart-1)', width: 1.5 } as const;

	function commitment(quotaValue: number | undefined): ChartSeries[] {
		return [
			{ key: 'used', label: m.ws_analytics_used(), ...USED },
			{ key: 'requested', label: m.ws_analytics_requested(), ...REQUESTED },
			{ key: 'limit', label: m.analytics_limit(), ...LIMIT },
			...(quotaValue !== undefined
				? [{ key: 'quota', label: m.ws_analytics_quota(), ...QUOTA }]
				: [])
		];
	}
	// A quota is the workspace's, so only its own charts draw it.
	const cpuQuota = $derived(wholeWorkspace ? quota.cpu : undefined);
	const memoryQuota = $derived(wholeWorkspace ? quota.memory : undefined);

	const cpuData = $derived(
		chartRows({ used: lines.cpuUse, requested: lines.cpuReq, limit: lines.cpuLim }, 1, {
			quota: cpuQuota
		})
	);
	const memoryData = $derived(
		chartRows({ used: lines.memUse, requested: lines.memReq, limit: lines.memLim }, 1 / GIB, {
			quota: memoryQuota
		})
	);
	/** Lines that take the four categorical colours by name, the rest merged into one. */
	function coloured(
		named: { name: string; line: Line }[],
		otherLabel: string,
		how: 'avg' | 'max'
	): { series: ChartSeries[]; lines: Record<string, Line> } {
		const slots = colourSlots(named.map((n) => n.name));
		const series: ChartSeries[] = [];
		const out: Record<string, Line> = {};
		const rest: Series[] = [];
		for (const { name, line } of [...named].sort((a, b) => a.name.localeCompare(b.name))) {
			const slot = slots.get(name);
			if (slot === undefined || slot === OTHER) {
				rest.push({ labels: {}, points: [...line].map(([t, v]) => ({ t, v })) });
				continue;
			}
			out[`s${slot}`] = line;
			series.push({
				key: `s${slot}`,
				label: name,
				style: 'line',
				width: 1.5,
				color: WORKSPACE_COLORS[slot]
			});
		}
		if (rest.length > 0) {
			out.other = mergeLines(rest, () => true, how);
			series.push({
				key: 'other',
				label: otherLabel,
				style: 'line',
				width: 1.5,
				color: OTHER_COLOR
			});
		}
		return { series, lines: out };
	}

	const volumeChart = $derived.by(() => {
		const named = volumes
			.filter((s) => s.labels.persistentvolumeclaim)
			.map((s) => ({
				name: s.labels.persistentvolumeclaim,
				line: new Map(s.points.map((p) => [p.t, p.v])) as Line
			}));
		// The fullest of the volumes past the fourth stands for them: it is the one to watch.
		const c = coloured(named, m.ws_analytics_other_pvcs(), 'max');
		return {
			count: named.length,
			series: [
				...c.series,
				{
					key: 'full',
					label: m.ws_analytics_90_full(),
					style: 'dashed',
					color: 'var(--destructive)'
				}
			] as ChartSeries[],
			data: chartRows(c.lines, 1, { full: 90 })
		};
	});

	const bucketLabel = $derived(
		bucketSeconds === 3600
			? m.ws_analytics_restarts_per_hour()
			: bucketSeconds < 3600
				? m.ws_analytics_restarts_per_minutes({ count: String(bucketSeconds / 60) })
				: m.ws_analytics_restarts_per_hours({ count: String(bucketSeconds / 3600) })
	);
</script>

<SummaryStrip {items} state={stripState} />

<div class="grid gap-2 @md:gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
	<HistoryChart
		title={m.analytics_cpu()}
		subtitle={m.ws_analytics_sub_cores()}
		peak={m.ws_analytics_chart_avg_peak({
			avg: fmtCores(cpuUse.avg),
			peak: fmtCores(cpuUse.peak)
		})}
		data={cpuData}
		state={usageState}
		format={cores}
		series={commitment(cpuQuota)}
		evenTicks
	/>
	<HistoryChart
		title={m.analytics_memory()}
		subtitle={m.analytics_unit_gib()}
		peak={m.ws_analytics_chart_avg_peak({
			avg: fmtGiB(memUse.avg),
			peak: fmtGiB(memUse.peak)
		})}
		data={memoryData}
		state={usageState}
		format={gib}
		series={commitment(memoryQuota)}
		evenTicks
	/>
	<HourlyChart
		title={m.analytics_restarts()}
		data={restartBars}
		series={[{ key: 'restarts', label: bucketLabel, color: 'var(--chart-1)' }]}
		format={(v) => fmt(v)}
		state={restartsState}
		{bucketSeconds}
	/>
	{#if volumesState === 'loading' || volumesState === 'error' || volumeChart.count > 0}
		<HistoryChart
			title={m.ws_analytics_volume_usage()}
			subtitle={m.ws_analytics_sub_volumes()}
			peak={volumeChart.count === 1
				? m.ws_analytics_pvc_one()
				: m.ws_analytics_pvc_many({ count: fmt(volumeChart.count) })}
			data={volumeChart.data}
			state={volumesState}
			format={percent}
			yMax={100}
			series={volumeChart.series}
			evenTicks
		/>
	{/if}
</div>
