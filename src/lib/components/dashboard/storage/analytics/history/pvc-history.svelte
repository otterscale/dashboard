<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { fetchRange, stepFor, toPoints } from '$lib/components/dashboard/kit/fetch';
	import HistoryChart, {
		type ChartPoint
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';

	import { fmtBytes } from '../../overview/format';
	import { HISTORY_GRID, LINE } from '../lib/chart';
	import type { PvcItem } from '../lib/model';
	import { pvcHistoryQueries } from '../lib/queries';

	// The picked PVC over the window: what it used against its capacity. kubelet reports a volume
	// only while a Pod mounts it, so the line breaks off where it was not mounted.
	let {
		client,
		pvc,
		state: listState,
		start,
		end,
		windowLabel
	}: {
		client: PrometheusDriver;
		pvc: PvcItem | undefined;
		state: WidgetState;
		start: Date;
		end: Date;
		windowLabel: string;
	} = $props();

	const loader = new Loader<ChartPoint[]>(
		async () => {
			if (!pvc) return null;
			const step = stepFor(start, end, 120);
			const r = await fetchRange(
				client,
				pvcHistoryQueries(pvc.namespace, pvc.name),
				start,
				end,
				step
			);
			return r && toPoints(r, ['used', 'capacity']);
		},
		(d) => d.length === 0
	);
	// Loads once the PVC is known (the list may still be on its way when a link opens History)
	// and again for a new window, each time from the loading state.
	// The list refreshes with a new object for the same PVC; only a different PVC reloads.
	const key = $derived(pvc?.key);
	const from = $derived(start.getTime());
	const to = $derived(end.getTime());
	$effect(() => {
		void from;
		void to;
		if (key === undefined) return;
		untrack(() => {
			loader.reset();
			void loader.load();
		});
	});

	const state = $derived(pvc ? loader.state : listState);
	const last = $derived(loader.data?.at(-1));
</script>

<div class={HISTORY_GRID[1]}>
	<HistoryChart
		title={m.storage_col_used()}
		subtitle={windowLabel}
		peak={pvc?.live && last && typeof last.used === 'number'
			? m.storage_an_now_value({
					value: m.storage_an_of({
						used: fmtBytes(last.used),
						total: fmtBytes(typeof last.capacity === 'number' ? last.capacity : undefined)
					})
				})
			: undefined}
		{state}
		data={loader.data ?? []}
		series={[
			{ key: 'used', label: m.storage_col_used(), ...LINE.main },
			{ key: 'capacity', label: m.storage_an_col_capacity(), ...LINE.reference }
		]}
		format={fmtBytes}
		evenTicks
	/>
</div>
