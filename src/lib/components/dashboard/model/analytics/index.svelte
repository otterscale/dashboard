<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	import { Loader } from '$lib/components/dashboard/cluster/analytics/lib/loader.svelte';
	import { Tile } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import type { SharedMetrics } from '$lib/prometheus';

	import BPodHealth from './b-pod-health.svelte';
	import HistoryView from './history/history-view.svelte';
	import { fetchModelPods, type ModelPods } from './lib/model-pods';
	import { engineVersion } from './lib/pods';
	import { pickModel, quietState, type RankedModel, type RankTab } from './lib/ranking';
	import ModelHeading from './model-heading.svelte';
	import ModelRanking from './model-ranking.svelte';
	import EngineConfig from './now/engine-config.svelte';
	import NowCards from './now/now-cards.svelte';
	import PodsTable from './now/pods-table.svelte';

	// The Analytics tab: a ranking that is also the picker, then the picked model as it is now or
	// over the chosen window, arranged by four questions: is it slow, busy, why, and the hardware.
	let {
		cluster,
		namespace,
		client,
		shared,
		history,
		tick,
		start,
		end,
		windowLabel,
		selected = $bindable(),
		tab = $bindable(),
		deployHref,
		onLonger
	}: {
		cluster: string;
		/** '' for every namespace. */
		namespace: string;
		client: PrometheusDriver;
		shared: SharedMetrics;
		history: boolean;
		/** Bumped by Auto update; Now cards refetch on it. */
		tick: number;
		start: Date;
		end: Date;
		windowLabel: string;
		/** `namespace/id` of the picked model (a bare id from an older link is resolved). */
		selected: string | undefined;
		tab: RankTab;
		/** AI Studio's Model list, for the empty state. */
		deployHref?: string;
		/** Widen History's window, for the empty state; absent when it cannot grow. */
		onLonger?: () => void;
	} = $props();

	const transport = getContext<Transport>('transport');
	const resources = createClient(ResourceService, transport);

	let models = $state.raw<RankedModel[]>([]);
	let answered = $state(false);
	function onRows(rows: RankedModel[]) {
		models = rows;
		answered = true;
		const pick = pickModel(
			rows.map((r) => r.key),
			selected
		);
		if (pick !== selected) selected = pick;
	}
	const current = $derived(models.find((r) => r.key === selected));
	const quiet = $derived(current ? quietState(current) : undefined);

	// The picked model's pods, shared by the heading, the Pods table, Health, Engine and History.
	const pods = new Loader<ModelPods>(() =>
		selected ? fetchModelPods(resources, client, cluster, selected) : Promise.resolve(null)
	);
	// Which model the pod list belongs to; plain, since only the effect below reads it.
	let podsFor: string | undefined;
	const hasCurrent = $derived(current !== undefined);
	$effect(() => {
		const key = selected;
		void tick;
		if (!key || !hasCurrent) return;
		untrack(async () => {
			if (podsFor !== key) {
				podsFor = key;
				pods.data = undefined;
				pods.state = 'loading';
			}
			await pods.load();
		});
	});
	const podsState = $derived<'loading' | 'ready' | 'error'>(
		pods.state === 'loading' ? 'loading' : pods.state === 'error' ? 'error' : 'ready'
	);
	const version = $derived(
		engineVersion(
			(pods.data?.pods.find((p) => p.status.key === 'running' && p.image) ?? pods.data?.pods[0])
				?.image
		)
	);
	/** A short fade from placeholder to content; none for anyone who asks for less motion. */
	const reveal = $derived({ duration: prefersReducedMotion.current ? 0 : 150 });
	const rangeKey = $derived(`${start.getTime()}-${end.getTime()}`);
</script>

{#snippet pending()}
	<!-- Same footprint as the Now detail while the ranking is still loading. -->
	<div class="flex flex-col gap-2 @md:gap-3">
		<Skeleton class="mt-3 h-7 w-64" />
		<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
			{#each [m.model_analytics_rps(), m.model_analytics_gen_tps(), m.model_analytics_kv_cache(), m.model_analytics_ttft_p95(), m.model_analytics_tpot_p95()] as label (label)}
				<Tile {label} state="loading" />
			{/each}
		</div>
		<Skeleton class="h-40 w-full rounded-2xl bg-card shadow-(--card-frame)" />
	</div>
{/snippet}

<!-- `@container`: every layout below follows this element's width, not the viewport's. -->
<div class="@container flex flex-col gap-2 pt-3 @md:gap-3">
	<ModelRanking
		{client}
		{cluster}
		{namespace}
		{tick}
		{history}
		{start}
		{end}
		{windowLabel}
		bind:tab
		{selected}
		onSelect={(key) => (selected = key)}
		{onRows}
		{deployHref}
		onLonger={history ? onLonger : undefined}
	/>

	{#if current && selected}
		{#key selected}
			<!-- The picked model fades in over its placeholder rather than cutting to it. -->
			<div class="flex flex-col gap-2" in:fade|global={reveal}>
				<ModelHeading row={current} {version} versionLoading={podsState === 'loading'} />
				{#if history}
					{#if !quiet}
						{#key rangeKey}
							<HistoryView {client} {shared} modelKey={selected} model={pods.data} {start} {end} />
						{/key}
					{/if}
				{:else}
					<NowCards {client} modelKey={selected} {tick} {quiet} />
					<PodsTable
						{client}
						{shared}
						modelKey={selected}
						model={pods.data}
						modelState={podsState}
					/>
					<!-- Side by side and the same height; stacked at 900px and below. -->
					<div
						class="grid grid-cols-1 items-stretch gap-2 min-[901px]:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)] @md:gap-3"
					>
						<BPodHealth
							{client}
							{shared}
							modelKey={selected}
							model={pods.data}
							modelState={podsState}
						/>
						<EngineConfig
							{client}
							modelKey={selected}
							{tick}
							model={pods.data}
							modelState={podsState}
						/>
					</div>
				{/if}
			</div>
		{/key}
	{:else if !answered}
		{@render pending()}
	{/if}
</div>
