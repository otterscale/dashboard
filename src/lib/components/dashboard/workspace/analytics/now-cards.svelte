<script lang="ts">
	import { Meter, NUM, Tile, type WidgetState } from '$lib/components/dashboard/kit';
	import { DASH, fmt, fmtCores, fmtGiB, fmtPct } from '$lib/components/dashboard/kit/format';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import {
		type Entry,
		type PodNow,
		type Quota,
		restartSources,
		storageSummary,
		type Totals,
		type Volume
	} from './lib/model';

	// Now: five numbers for the selected row. Each bar is what is in use (dark) over what is
	// requested or allocated (light).
	let {
		entry,
		totals,
		rows,
		pods,
		quota,
		volumes,
		podsState,
		gpuState,
		volumesState
	}: {
		entry: Entry;
		totals: Totals | undefined;
		/** Every row, to say which workloads the workspace's restarts come from. */
		rows: { entry: Entry; totals: Totals }[];
		/** The selected row's pods, for why the last one stopped. */
		pods: PodNow[];
		quota: Quota;
		volumes: Volume[];
		podsState: WidgetState;
		gpuState: WidgetState;
		volumesState: WidgetState;
	} = $props();

	const isWorkspace = $derived(entry.kind === 'workspace');
	const pct = (value: number | undefined, of: number | undefined) =>
		value === undefined || !of || of <= 0 ? 0 : Math.min(100, Math.max(0, (100 * value) / of));

	function commitment(
		kind: 'cpu' | 'memory',
		show: (value: number | undefined) => string,
		unit: string
	) {
		const t = totals?.[kind] ?? {};
		const hard = isWorkspace ? quota[kind] : undefined;
		const scale = hard ?? t.requested;
		const requested = show(t.requested);
		const note = isWorkspace
			? hard !== undefined
				? m.ws_analytics_note_of_quota({ requested, quota: show(hard), unit })
				: m.ws_analytics_note_requested({ requested, unit })
			: m.ws_analytics_note_workload({ requested, limit: show(t.limit) });
		return {
			value: show(t.used),
			unit,
			solid: pct(t.used, scale),
			soft: pct(t.requested, scale),
			note
		};
	}

	const cpu = $derived(commitment('cpu', fmtCores, m.analytics_unit_cores()));
	const memory = $derived(commitment('memory', fmtGiB, m.analytics_unit_gib()));

	const restartsNote = $derived.by(() => {
		const count = totals?.restarts ?? 0;
		if (count === 0) return m.ws_analytics_no_restarts();
		if (isWorkspace) {
			const sources = restartSources(rows);
			if (sources.length === 0) return m.ws_analytics_from_other_pods();
			if (sources.length === 1) return m.ws_analytics_all_from({ name: sources[0] });
			if (sources.length === 2) return m.ws_analytics_from_two({ a: sources[0], b: sources[1] });
			return m.ws_analytics_from_many({ count: String(sources.length) });
		}
		const last = [...pods].sort((a, b) => b.restarts - a.restarts).find((p) => p.lastReason);
		if (!last?.lastReason) return entry.reason || m.ws_analytics_in_24h();
		return last.exitCode !== undefined
			? m.ws_analytics_last_exit({ reason: last.lastReason, code: fmt(last.exitCode) })
			: m.ws_analytics_last_reason({ reason: last.lastReason });
	});

	const storage = $derived(storageSummary(volumes));
	const storageNote = $derived.by(() => {
		if (storage.count === 0) return m.ws_analytics_no_volumes_mounted();
		const base =
			storage.count === 1
				? m.ws_analytics_written_one({ capacity: fmtGiB(storage.capacity) })
				: m.ws_analytics_written_many({
						capacity: fmtGiB(storage.capacity),
						count: fmt(storage.count)
					});
		return storage.soonest
			? `${base} · ${m.ws_analytics_full_in({ name: storage.soonest.name, days: String(storage.soonest.days) })}`
			: base;
	});
</script>

{#snippet figure(
	value: string,
	unit: string,
	bar: { solid: number; soft?: number } | undefined,
	note: string,
	valueClass?: string
)}
	<p class={cn('truncate text-[1.75rem] leading-8 tracking-tight', NUM, valueClass)}>
		{value}{#if unit}<span class="ml-1.5 text-xl tracking-normal">{unit}</span>{/if}
	</p>
	{#if bar}
		<Meter value={bar.solid} soft={bar.soft} class="mt-2" />
	{:else}
		<!-- No bar to draw: its room stays, so the five notes sit on one line. -->
		<span class="mt-2 block h-1.5" aria-hidden="true"></span>
	{/if}
	<p class="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground" title={note}>
		{note}
	</p>
{/snippet}

<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
	<Tile label={m.analytics_cpu()} state={podsState} class="min-h-[9.25rem]">
		{#snippet body()}
			{@render figure(cpu.value, cpu.unit, cpu, cpu.note)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_memory()} state={podsState} class="min-h-[9.25rem]">
		{#snippet body()}
			{@render figure(memory.value, memory.unit, memory, memory.note)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_gpu()} state={gpuState} class="min-h-[9.25rem]">
		{#snippet body()}
			{#if totals?.gpu}
				{@render figure(
					fmtPct(totals.gpu.util),
					'',
					{ solid: pct(totals.gpu.used, totals.gpu.allocated), soft: 100 },
					totals.gpu.used === undefined
						? m.ws_analytics_gpu_note_shared({ allocated: fmtGiB(totals.gpu.allocated) })
						: m.ws_analytics_gpu_note({
								used: fmtGiB(totals.gpu.used),
								allocated: fmtGiB(totals.gpu.allocated)
							})
				)}
			{:else}
				{@render figure(
					DASH,
					'',
					undefined,
					isWorkspace ? m.analytics_no_gpu_workloads() : m.analytics_no_gpu(),
					'text-muted-foreground'
				)}
			{/if}
		{/snippet}
	</Tile>
	<Tile label={m.ws_analytics_restarts_24h()} state={podsState} class="min-h-[9.25rem]">
		{#snippet body()}
			{@render figure(
				fmt(totals?.restarts ?? 0),
				'',
				undefined,
				restartsNote,
				(totals?.restarts ?? 0) > 0 ? 'text-chart-1' : undefined
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_storage()} state={volumesState} class="min-h-[9.25rem]">
		{#snippet body()}
			{#if storage.count > 0}
				{@render figure(
					fmtGiB(storage.used),
					m.analytics_unit_gib(),
					{ solid: pct(storage.used, storage.capacity), soft: 100 },
					storageNote
				)}
			{:else}
				{@render figure(DASH, '', undefined, storageNote, 'text-muted-foreground')}
			{/if}
		{/snippet}
	</Tile>
</div>
