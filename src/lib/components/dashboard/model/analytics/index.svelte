<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	import { Tile } from '$lib/components/dashboard/kit';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
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

	// The picked model's pods, shared by the heading, the Pods table, Health, Engine and History.
	// The answer carries the model it was asked for, so a list is never read as another model's.
	const pods = new Loader<{ key: string; model: ModelPods }>(async () => {
		const key = selected;
		if (!key) return null;
		const model = await fetchModelPods(resources, client, cluster, key);
		return model && { key, model };
	});
	/** Pick a model: the last one's pods go at once, with any answer still on its way. */
	function select(key: string | undefined) {
		if (key === selected) return;
		pods.reset();
		selected = key;
	}

	let models = $state.raw<RankedModel[]>([]);
	let answered = $state(false);
	function onRows(rows: RankedModel[]) {
		models = rows;
		answered = true;
		select(
			pickModel(
				rows.map((r) => r.key),
				selected
			)
		);
	}
	const current = $derived(models.find((r) => r.key === selected));
	const quiet = $derived(current ? quietState(current) : undefined);

	const hasCurrent = $derived(current !== undefined);
	$effect(() => {
		void [selected, tick];
		if (!selected || !hasCurrent) return;
		untrack(() => pods.load());
	});
	// The cards under `{#key selected}` are created before any effect runs, so they must not be
	// handed the last model's pods: a list counts only when it was asked for the picked model.
	const model = $derived.by(() => {
		const answer = pods.data;
		return answer && answer.key === selected ? answer.model : undefined;
	});
	const podsState = $derived<'loading' | 'ready' | 'error'>(
		model ? 'ready' : pods.state === 'error' ? 'error' : 'loading'
	);
	const version = $derived(
		engineVersion(
			(model?.pods.find((p) => p.status.key === 'running' && p.image) ?? model?.pods[0])?.image
		)
	);
	/** A short fade from placeholder to content; none for anyone who asks for less motion. */
	const reveal = $derived({ duration: prefersReducedMotion.current ? 0 : 150 });
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
		onSelect={select}
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
						<HistoryView {client} {shared} modelKey={selected} {model} {start} {end} />
					{/if}
				{:else}
					<NowCards {client} modelKey={selected} {tick} {quiet} />
					<PodsTable {client} {shared} modelKey={selected} {model} modelState={podsState} />
					<!-- Side by side and the same height; stacked at 900px and below. -->
					<div
						class="grid grid-cols-1 items-stretch gap-2 min-[901px]:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)] @md:gap-3"
					>
						<BPodHealth {client} {shared} modelKey={selected} {model} modelState={podsState} />
						<EngineConfig {client} modelKey={selected} {tick} {model} modelState={podsState} />
					</div>
				{/if}
			</div>
		{/key}
	{:else if !answered}
		{@render pending()}
	{/if}
</div>
