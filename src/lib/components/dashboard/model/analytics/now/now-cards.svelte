<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { fetchInstant, scalar } from '$lib/components/dashboard/cluster/analytics/lib/fetch';
	import { Loader } from '$lib/components/dashboard/cluster/analytics/lib/loader.svelte';
	import { Meter, Tile } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import {
		DASH,
		fmtCount,
		fmtMillis,
		fmtPercent,
		fmtRate,
		fmtSeconds
	} from '../../overview/lib/models';
	import { nowCardQueries } from '../lib/queries';
	import { kvClass } from '../lib/ranking';

	// Now: five numbers for the picked model, read on every auto update.
	let {
		client,
		modelKey,
		tick,
		quiet
	}: {
		client: PrometheusDriver;
		modelKey: string;
		tick: number;
		/** Starting or no traffic: the cards say why there is no number. */
		quiet?: 'starting' | 'idle';
	} = $props();

	const loader = new Loader<Record<string, number | undefined>>(async () => {
		const r = await fetchInstant(client, nowCardQueries(modelKey));
		if (!r) return null;
		return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, scalar(v)]));
	});
	$effect(() => {
		void tick;
		untrack(() => loader.load());
	});

	const d = $derived(loader.data ?? {});
	const starting = $derived(quiet === 'starting');
	const noRequests = $derived(m.model_analytics_no_requests());
	function latencyNote(mean: number | undefined, p99: number | undefined): string {
		if (mean === undefined && p99 === undefined) return starting ? DASH : noRequests;
		return m.model_analytics_mean_p99({ mean: fmtMillis(mean), p99: fmtMillis(p99) });
	}
</script>

<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
	<Tile label={m.model_analytics_rps()} state={loader.state} class="justify-start">
		{starting ? DASH : fmtRate(d.rps)}
		{#snippet note()}
			{starting
				? m.model_analytics_not_serving()
				: m.model_analytics_running_waiting({
						running: fmtCount(d.running),
						waiting: fmtCount(d.waiting)
					})}
		{/snippet}
	</Tile>
	<Tile label={m.model_analytics_gen_tps()} state={loader.state} class="justify-start">
		{starting ? DASH : fmtRate(d.gen)}
		{#snippet note()}
			{starting ? DASH : m.model_analytics_prompt_tps({ value: fmtRate(d.prompt) })}
		{/snippet}
	</Tile>
	<Tile label={m.model_analytics_kv_cache()} state={loader.state} class="justify-start">
		{#snippet body()}
			<p
				class={cn(
					'truncate text-[1.75rem] leading-8 tracking-tight slashed-zero tabular-nums',
					kvClass(d.kvAvg)
				)}
			>
				{starting ? DASH : fmtPercent(d.kvAvg)}
			</p>
			<Meter value={starting ? 0 : d.kvAvg} class={cn('mt-2', kvClass(d.kvAvg))} />
			<p class="mt-1.5 text-xs leading-4 text-muted-foreground">
				{#if starting || d.kvMax === undefined}
					{DASH}
				{:else}
					{m.model_analytics_kv_note({
						busiest: fmtPercent(d.kvMax),
						preemptions: fmtCount(d.preemptions ?? 0)
					})}
				{/if}
			</p>
		{/snippet}
	</Tile>
	<Tile label={m.model_analytics_ttft_p95()} state={loader.state} class="justify-start">
		{starting ? DASH : fmtSeconds(d.ttftP95)}
		{#snippet note()}
			{latencyNote(d.ttftMean, d.ttftP99)}
		{/snippet}
	</Tile>
	<Tile label={m.model_analytics_tpot_p95()} state={loader.state} class="justify-start">
		{starting ? DASH : fmtMillis(d.tpotP95)}
		{#snippet note()}
			{latencyNote(d.tpotMean, d.tpotP99)}
		{/snippet}
	</Tile>
</div>
