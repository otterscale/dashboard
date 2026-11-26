<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { fetchRange, stats, stepFor, toPoints } from '$lib/components/dashboard/kit/fetch';
	import HistoryChart, {
		type ChartPoint
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';

	import { fmtIops, fmtMs, fmtPct } from '../../overview/format';
	import { HISTORY_GRID, LINE } from '../lib/chart';
	import { fmtWhole } from '../lib/format';
	import type { OsdCluster } from '../lib/model';
	import { osdHistoryQueries } from '../lib/queries';

	// The picked OSD over the window: how full it got against the cluster's ratios, its latency
	// beside the cluster's, and its operations.
	let {
		client,
		osd,
		cluster,
		osdCount,
		state: listState,
		start,
		end,
		windowLabel
	}: {
		client: PrometheusDriver;
		osd: string | undefined;
		cluster: OsdCluster;
		/** With one OSD the cluster's p95 is this OSD's own, so its line is left out. */
		osdCount: number;
		state: WidgetState;
		start: Date;
		end: Date;
		windowLabel: string;
	} = $props();

	type Data = {
		used: ChartPoint[];
		latency: ChartPoint[];
		ops: ChartPoint[];
		now: Record<string, number | undefined>;
	};
	const loader = new Loader<Data>(
		async () => {
			if (osd === undefined) return null;
			const step = stepFor(start, end, 120);
			const r = await fetchRange(client, osdHistoryQueries(osd, step), start, end, step);
			if (!r) return null;
			return {
				used: toPoints(r, ['used']),
				latency: toPoints(r, ['read', 'write', 'clusterWrite']),
				ops: toPoints(r, ['ops']),
				now: {
					used: stats(r.used[0]).last,
					read: stats(r.read[0]).last,
					write: stats(r.write[0]).last,
					ops: stats(r.ops[0]).last
				}
			};
		},
		(d) => d.used.length === 0 && d.ops.length === 0
	);
	onMount(() => {
		if (osd !== undefined) void loader.load();
	});

	const state = $derived(osd === undefined ? listState : loader.state);
	const d = $derived(loader.data);
	const nearfull = $derived(cluster.nearfull === undefined ? undefined : cluster.nearfull * 100);
	const full = $derived(cluster.full === undefined ? undefined : cluster.full * 100);
	// The cluster's ratios as flat lines, on every point of the used line.
	const used = $derived(
		(d?.used ?? []).map((p) => ({
			...p,
			...(nearfull === undefined ? {} : { nearfull }),
			...(full === undefined ? {} : { full })
		}))
	);
</script>

<div class={HISTORY_GRID[3]}>
	<HistoryChart
		title={m.storage_col_used()}
		subtitle={windowLabel}
		peak={d ? m.storage_an_now_value({ value: fmtPct(d.now.used) }) : undefined}
		{state}
		data={used}
		series={[
			{ key: 'used', label: osd ?? '', ...LINE.main },
			...(nearfull === undefined
				? []
				: [
						{
							key: 'nearfull',
							label: m.storage_an_nearfull_line({ pct: fmtPct(nearfull) }),
							...LINE.warning
						}
					]),
			...(full === undefined
				? []
				: [{ key: 'full', label: m.storage_an_full_line({ pct: fmtPct(full) }), ...LINE.critical }])
		]}
		format={fmtPct}
		evenTicks
		yMax={100}
	/>
	<HistoryChart
		title={m.storage_an_latency()}
		subtitle={m.storage_an_mean_5m()}
		peak={d
			? m.storage_now_read_write({ read: fmtMs(d.now.read), write: fmtMs(d.now.write) })
			: undefined}
		{state}
		data={d?.latency ?? []}
		series={[
			{ key: 'read', label: m.storage_an_read(), ...LINE.main },
			{ key: 'write', label: m.storage_an_write(), ...LINE.second },
			...(osdCount > 1
				? [{ key: 'clusterWrite', label: m.storage_an_cluster_write_p95(), ...LINE.reference }]
				: [])
		]}
		format={fmtMs}
		evenTicks
	/>
	<HistoryChart
		title={m.storage_operations()}
		subtitle={windowLabel}
		peak={d ? m.storage_an_now_value({ value: fmtIops(d.now.ops) }) : undefined}
		{state}
		data={d?.ops ?? []}
		series={[{ key: 'ops', label: m.storage_an_iops(), ...LINE.main }]}
		format={fmtWhole}
		evenTicks
	/>
</div>
