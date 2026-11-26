<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { fetchRange, stats, stepFor, toPoints } from '$lib/components/dashboard/kit/fetch';
	import HistoryChart, {
		type ChartPoint
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';

	import { fmtBytes, fmtIops, fmtRate } from '../../overview/format';
	import { HISTORY_GRID, LINE } from '../lib/chart';
	import { fmtWhole } from '../lib/format';
	import { poolHistoryQueries } from '../lib/queries';

	// The picked pool over the window: what it holds, and its operations and throughput.
	let {
		client,
		poolId,
		state: listState,
		start,
		end,
		windowLabel
	}: {
		client: PrometheusDriver;
		poolId: string | undefined;
		state: WidgetState;
		start: Date;
		end: Date;
		windowLabel: string;
	} = $props();

	type Data = {
		stored: ChartPoint[];
		ops: ChartPoint[];
		bytes: ChartPoint[];
		now: Record<string, number | undefined>;
	};
	const loader = new Loader<Data>(
		async () => {
			if (poolId === undefined) return null;
			const step = stepFor(start, end, 120);
			const r = await fetchRange(client, poolHistoryQueries(poolId, step), start, end, step);
			if (!r) return null;
			return {
				stored: toPoints(r, ['stored']),
				ops: toPoints(r, ['readOps', 'writeOps']),
				bytes: toPoints(r, ['readBytes', 'writeBytes']),
				now: {
					readOps: stats(r.readOps[0]).last,
					writeOps: stats(r.writeOps[0]).last,
					readBytes: stats(r.readBytes[0]).last,
					writeBytes: stats(r.writeBytes[0]).last
				}
			};
		},
		(d) => d.stored.length === 0 && d.ops.length === 0
	);
	// Loads once the pool is known (the list may still be on its way when a link opens History)
	// and again for a new window, each time from the loading state.
	const from = $derived(start.getTime());
	const to = $derived(end.getTime());
	$effect(() => {
		void from;
		void to;
		if (poolId === undefined) return;
		untrack(() => {
			loader.reset();
			void loader.load();
		});
	});

	const state = $derived(poolId === undefined ? listState : loader.state);
	const d = $derived(loader.data);
</script>

<div class={HISTORY_GRID[3]}>
	<HistoryChart
		title={m.storage_an_stored_data()}
		subtitle={windowLabel}
		{state}
		data={d?.stored ?? []}
		series={[{ key: 'stored', label: m.storage_an_stored(), ...LINE.main }]}
		format={fmtBytes}
		evenTicks
	/>
	<HistoryChart
		title={m.storage_operations()}
		subtitle={windowLabel}
		peak={d
			? m.storage_now_read_write({ read: fmtIops(d.now.readOps), write: fmtIops(d.now.writeOps) })
			: undefined}
		{state}
		data={d?.ops ?? []}
		series={[
			{ key: 'readOps', label: m.storage_an_read(), ...LINE.main },
			{ key: 'writeOps', label: m.storage_an_write(), ...LINE.second }
		]}
		format={fmtWhole}
		evenTicks
	/>
	<HistoryChart
		title={m.storage_an_throughput()}
		subtitle={windowLabel}
		peak={d
			? m.storage_now_read_write({
					read: fmtRate(d.now.readBytes),
					write: fmtRate(d.now.writeBytes)
				})
			: undefined}
		{state}
		data={d?.bytes ?? []}
		series={[
			{ key: 'readBytes', label: m.storage_an_read(), ...LINE.main },
			{ key: 'writeBytes', label: m.storage_an_write(), ...LINE.second }
		]}
		format={fmtRate}
		evenTicks
	/>
</div>
