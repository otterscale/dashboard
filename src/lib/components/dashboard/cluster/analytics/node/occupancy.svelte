<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { Panel } from '$lib/components/dashboard/kit';
	import { byPod, fetchInstant, scalar } from '$lib/components/dashboard/kit/fetch';
	import { fmt, fmtCores, fmtGiB, fmtGpuGiB, sum } from '$lib/components/dashboard/kit/format';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import Segmented from '$lib/components/dashboard/kit/segmented.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	import {
		buildGpuCards,
		type CardInput,
		cardsPerPod,
		gpuGrid,
		type PodShare
	} from '../lib/gpu-cards';
	import { nodePodQueries } from '../lib/promql';
	import { OTHER_GROUP, SYSTEM_GROUP, type WorkspacePalette } from '../lib/workspaces';
	import GpuCardMap from './gpu-card-map.svelte';
	import OccupancyMap from './occupancy-map.svelte';
	import OccupancyTable from './occupancy-table.svelte';
	import {
		type Measure,
		type Occupancy,
		type OccupancyPod,
		podValue,
		type Resource
	} from './occupancy-types';

	let {
		client,
		tick,
		node,
		palette
	}: { client: PrometheusDriver; tick: number; node: string; palette: WorkspacePalette } = $props();

	let resource = $state<Resource>('cpu');
	let cpuMeasure = $state<Measure>('request');
	let gpuMeasure = $state<'usage' | 'allocated'>('allocated');
	const measure = $derived<Measure>(resource === 'gpu' ? gpuMeasure : cpuMeasure);

	let cardsOfPod = $state.raw(new Map<string, number>());

	const loader = new Loader<Occupancy>(
		async () => {
			const r = await fetchInstant(client, nodePodQueries(node));
			if (!r) return null;
			const cards: CardInput[] = r.gpuTotal.map((s) => ({
				uuid: s.labels.device_uuid,
				device: s.labels.device ?? `gpu${s.labels.gpu}`,
				index: Number(s.labels.gpu ?? 0),
				model: s.labels.modelName ?? '',
				capacity: s.value,
				used: r.gpuUsed.find((u) => u.labels.device_uuid === s.labels.device_uuid)?.value ?? 0
			}));
			const share = (list: typeof r.gpuAlloc): PodShare[] =>
				list
					.filter((s) => s.labels.namespace && s.labels.pod && s.labels.device_uuid)
					.map((s) => ({
						namespace: s.labels.namespace,
						pod: s.labels.pod,
						uuid: s.labels.device_uuid,
						bytes: s.value
					}));
			const allocations = share(r.gpuAlloc);
			const tracked = share(r.gpuTracked);
			const gpuCards = buildGpuCards(cards, allocations, tracked);
			cardsOfPod = cardsPerPod(allocations);

			const onNode = new Set(cards.map((c) => c.uuid));
			const gpuSum = (list: PodShare[]) => {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
				const map = new Map<string, number>();
				for (const s of list) {
					if (!onNode.has(s.uuid)) continue;
					const key = `${s.namespace}/${s.pod}`;
					map.set(key, (map.get(key) ?? 0) + s.bytes);
				}
				return map;
			};
			const gpuAlloc = gpuSum(allocations);
			const gpuUsed = gpuSum(tracked);
			const [cpuUse, cpuReq, cpuLim, memUse, memReq, memLim] = [
				r.cpuUse,
				r.cpuReq,
				r.cpuLim,
				r.memUse,
				r.memReq,
				r.memLim
			].map(byPod);
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
			const keys = new Set(r.pods.map((s) => `${s.labels.namespace}/${s.labels.pod}`));
			for (const k of gpuAlloc.keys()) keys.add(k);
			const pods: OccupancyPod[] = [...keys].map((key) => {
				const [namespace, ...rest] = key.split('/');
				return {
					key,
					namespace,
					pod: rest.join('/'),
					// Placeholder; `pods` below groups at render, so a late workspace list still applies.
					group: { id: '', color: '' },
					cpu: [cpuUse.get(key) ?? 0, cpuReq.get(key) ?? 0, cpuLim.get(key) ?? 0],
					memory: [memUse.get(key) ?? 0, memReq.get(key) ?? 0, memLim.get(key) ?? 0],
					gpuUsed: gpuUsed.get(key),
					gpuAllocated: gpuAlloc.get(key),
					gpuCards: cardsOfPod.get(key) ?? 0
				};
			});
			return {
				pods,
				cpuAllocatable: scalar(r.cpuAlloc),
				memAllocatable: scalar(r.memAlloc),
				cards: gpuCards
			};
		},
		(d) => d.pods.length === 0 && d.cards.length === 0
	);

	$effect(() => {
		void tick;
		untrack(() => loader.load());
	});

	const data = $derived(loader.data);
	const pods = $derived(
		(data?.pods ?? []).map((p) => ({ ...p, group: palette.groupOf(p.namespace) }))
	);
	const cards = $derived(data?.cards ?? []);
	const gpuCapacity = $derived(sum(cards.map((c) => c.capacity)));
	const capacity = $derived(
		resource === 'cpu'
			? data?.cpuAllocatable
			: resource === 'memory'
				? data?.memAllocatable
				: gpuCapacity
	);
	const total = $derived(sum(pods.map((p) => podValue(p, resource, measure))));
	const grid = $derived(gpuGrid(cards.length));

	function groupName(id: string): string {
		if (id === SYSTEM_GROUP) return m.analytics_system_namespaces();
		if (id === OTHER_GROUP) return m.analytics_other_workspaces();
		return id;
	}

	const summary = $derived.by(() => {
		if (!data) return '';
		if (resource === 'gpu') {
			if (cards.length === 0) return m.analytics_no_gpus_on_node();
			const used = sum(cards.map((c) => c.used));
			const allocated = sum(cards.map((c) => c.allocated));
			const outside = sum(cards.map((c) => c.outside ?? 0));
			const pct = (v: number) => fmt(gpuCapacity ? (v / gpuCapacity) * 100 : 0, 1);
			return measure === 'usage'
				? m.analytics_gpu_summary_usage({
						used: fmtGpuGiB(used),
						total: fmtGpuGiB(gpuCapacity),
						pct: pct(used),
						outside: fmtGpuGiB(outside)
					})
				: m.analytics_gpu_summary_allocated({
						allocated: fmtGpuGiB(allocated),
						total: fmtGpuGiB(gpuCapacity),
						pct: pct(allocated),
						used: fmtGpuGiB(used)
					});
		}
		const show = resource === 'cpu' ? fmtCores : fmtGiB;
		const unit = resource === 'cpu' ? m.analytics_unit_cores() : m.analytics_unit_gib();
		const values = {
			value: show(total),
			total: `${resource === 'cpu' ? fmt(capacity) : fmtGiB(capacity)} ${unit}`,
			pct: fmt(capacity ? (total / capacity) * 100 : 0, 1)
		};
		return measure === 'usage'
			? m.analytics_summary_usage(values)
			: measure === 'limit'
				? m.analytics_summary_limit(values)
				: m.analytics_summary_request(values);
	});
	const overcommitted = $derived(
		resource !== 'gpu' && measure === 'limit' && capacity !== undefined && total > capacity
	);
</script>

<Panel
	title={m.analytics_occupancy_title()}
	tooltip={m.analytics_occupancy_tooltip()}
	state={loader.state}
	class="sm:min-h-[40rem]"
>
	<div class="flex flex-wrap items-center gap-2">
		<Segmented
			label={m.analytics_resource()}
			bind:value={resource}
			options={[
				{ value: 'gpu', label: m.analytics_gpu() },
				{ value: 'cpu', label: m.analytics_cpu() },
				{ value: 'memory', label: m.analytics_memory() }
			]}
		/>
		{#if resource === 'gpu'}
			<Segmented
				label={m.analytics_measure()}
				bind:value={gpuMeasure}
				options={[
					{ value: 'usage', label: m.analytics_usage() },
					{ value: 'allocated', label: m.analytics_allocated() }
				]}
			/>
		{:else}
			<Segmented
				label={m.analytics_measure()}
				bind:value={cpuMeasure}
				options={[
					{ value: 'usage', label: m.analytics_usage() },
					{ value: 'request', label: m.analytics_request() },
					{ value: 'limit', label: m.analytics_limit() }
				]}
			/>
		{/if}
		<p class="min-w-0 text-[0.8125rem] text-muted-foreground tabular-nums sm:ml-1">{summary}</p>
	</div>

	<div class="mt-4">
		<p class="text-[0.8125rem] text-muted-foreground sm:hidden">{m.analytics_map_needs_width()}</p>
		<div class="max-sm:hidden">
			{#if !data}
				<Skeleton class="h-[360px] w-full rounded-lg" />
			{:else if resource === 'gpu'}
				{#if cards.length === 0}
					<div
						class="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
					>
						{m.analytics_node_has_no_gpus()}
					</div>
				{:else}
					<div
						class="grid gap-x-3 gap-y-4"
						style:grid-template-columns="repeat({grid.columns}, minmax(0, 1fr))"
					>
						{#each cards as card (card.uuid)}
							<GpuCardMap
								{card}
								measure={gpuMeasure}
								height={grid.height}
								groupOf={(ns) => palette.groupOf(ns)}
								cardsOf={(key) => cardsOfPod.get(key) ?? 0}
							/>
						{/each}
					</div>
				{/if}
			{:else if capacity}
				<OccupancyMap {pods} {resource} {measure} {capacity} {groupName} />
				{#if overcommitted}
					<p class="mt-2 text-xs text-muted-foreground">{m.analytics_limit_overcommit_note()}</p>
				{/if}
			{/if}
		</div>
	</div>

	{#if data}
		<div class="mt-5">
			<OccupancyTable {pods} {resource} {measure} {capacity} {groupName} />
		</div>
	{/if}
</Panel>
