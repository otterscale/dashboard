<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { byLabel, fetchInstant } from '$lib/components/dashboard/cluster/analytics/lib/fetch';
	import { Loader } from '$lib/components/dashboard/cluster/analytics/lib/loader.svelte';
	import { Meter, NUM, Status } from '$lib/components/dashboard/kit';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import type { SharedMetrics } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { DASH, fmtCount, fmtPercent, fmtRate } from '../../overview/lib/models';
	import { CATEGORY_COLORS } from '../lib/chart-style';
	import type { ModelPods } from '../lib/model-pods';
	import {
		byNode,
		fmtGiB,
		nodeTags,
		podGpuMemory,
		type PodStatusKey,
		splitTail
	} from '../lib/pods';
	import { podEngineQueries, podKubeQueries, splitKey } from '../lib/queries';
	import { kvClass, waitingClass } from '../lib/ranking';

	// One row per replica: where it runs, its state, the engine's load and the pod's memory.
	let {
		client,
		shared,
		modelKey,
		model,
		modelState
	}: {
		client: PrometheusDriver;
		shared: SharedMetrics;
		modelKey: string;
		model: ModelPods | undefined;
		modelState: 'loading' | 'ready' | 'error';
	} = $props();

	type Numbers = {
		engine: Record<string, Map<string, number>>;
		kube: Record<string, Map<string, number>>;
		gpuUsed: Map<string, number>;
		tenants: Map<string, number>;
	};

	async function gpuUsage(): Promise<Pick<Numbers, 'gpuUsed' | 'tenants'>> {
		const empty = { gpuUsed: new Map<string, number>(), tenants: new Map<string, number>() };
		if (!model?.pods.some((p) => p.hami.length > 0)) return empty;
		try {
			const [used, tenants] = await Promise.all([
				shared.instant('vgpu-memory-used'),
				shared.instant('gpu-shared-count')
			]);
			const index = (result: typeof used) =>
				new Map(
					(
						result.result as {
							metric: { labels: Record<string, string> };
							value?: { value: unknown };
						}[]
					)
						.map((s) => [s.metric.labels.device_uuid, Number(s.value?.value)] as const)
						.filter(([uuid, v]) => uuid && Number.isFinite(v))
				);
			return { gpuUsed: index(used), tenants: index(tenants) };
		} catch (error) {
			console.warn('GPU memory per pod is unavailable:', error);
			return empty;
		}
	}

	const loader = new Loader<Numbers>(async () => {
		if (!model) return null;
		const { namespace } = splitKey(modelKey);
		const names = model.pods.map((p) => p.name);
		const [engine, kube, gpu] = await Promise.all([
			fetchInstant(client, podEngineQueries(modelKey)),
			fetchInstant(client, podKubeQueries(namespace, names, model.container)),
			gpuUsage()
		]);
		if (!engine && !kube) return null;
		const index = (r: typeof engine) =>
			Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, byLabel(v, 'pod')]));
		return { engine: index(engine), kube: index(kube), ...gpu };
	});

	$effect(() => {
		// The pod list is read again on every auto update, so a new list is the cue to refetch.
		void model;
		if (model) untrack(() => loader.load());
	});

	const statusLabel: Record<PodStatusKey, () => string> = {
		running: m.model_analytics_pod_running,
		notReady: m.model_analytics_pod_not_ready,
		pending: m.model_analytics_pod_pending,
		initializing: m.model_analytics_pod_initializing,
		creating: m.model_analytics_pod_creating,
		pullingImage: m.model_analytics_pod_pulling_image,
		crashLoop: m.model_analytics_pod_crash_loop,
		imagePullError: m.model_analytics_pod_image_error,
		terminating: m.model_analytics_pod_terminating,
		succeeded: m.model_analytics_pod_succeeded,
		failed: m.model_analytics_pod_failed,
		other: m.model_analytics_pod_unknown
	};

	const state = $derived(
		modelState === 'loading' || (model && loader.state === 'loading')
			? 'loading'
			: modelState === 'error'
				? 'error'
				: 'ready'
	);
	// Grouped by machine: pods that share a node sit together under one short, coloured tag.
	const pods = $derived(byNode(model?.pods ?? []));
	const tags = $derived(nodeTags(pods, CATEGORY_COLORS));
	const placement = $derived(
		tags.size <= 1
			? m.model_analytics_on_one_node()
			: m.model_analytics_on_nodes({ nodes: String(tags.size) })
	);
	const n = $derived(loader.data);

	const head = 'px-2 py-2 text-right font-normal whitespace-nowrap';
	const cell = cn('px-2 text-right whitespace-nowrap', NUM);
</script>

{#snippet node(full: string)}
	{@const tag = tags.get(full)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<!-- A short bar, not a dot: the Status column beside it already speaks in dots. -->
				<span
					{...props}
					class="inline-flex items-center gap-2 text-[0.8125rem] whitespace-nowrap"
					aria-label={full}
				>
					<span class="h-4 w-1 rounded-full" style:background={tag?.color} aria-hidden="true"
					></span>
					{m.model_analytics_node_n({ n: tag?.label ?? '?' })}
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" align="start" class="max-w-none">
			<p class="font-mono text-xs whitespace-nowrap">{full}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

{#snippet name(full: string, segments: number, width: string)}
	{@const [head, tail] = splitTail(full, segments)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span
					{...props}
					class={cn('flex min-w-0 font-mono text-[0.78rem]', width)}
					aria-label={full}
				>
					<span class="truncate">{head}</span><span class="shrink-0">{tail}</span>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" align="start" class="max-w-none">
			<p class="font-mono text-xs whitespace-nowrap">{full}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Card.Root
	class="@container/panel gap-0 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:px-5 @md:py-[1.125rem]"
>
	<div class="flex items-baseline justify-between gap-2">
		<Card.Title class="text-sm leading-5 font-[550]">{m.model_analytics_pods()}</Card.Title>
		<p class="text-xs text-muted-foreground">
			{m.model_analytics_pods_note()}{#if tags.size > 0}&ensp;·&ensp;{placement}{/if}
		</p>
	</div>
	<div class="-mx-1 mt-2 overflow-x-auto px-1">
		<table class="w-full min-w-[56rem] text-[0.8125rem]">
			<thead class="text-xs text-muted-foreground">
				<tr class="border-b">
					<th class="py-2 pr-2 text-left font-normal">{m.model_analytics_col_pod()}</th>
					<th class="px-2 py-2 text-left font-normal">{m.node()}</th>
					<th class="px-2 py-2 text-left font-normal">{m.model_analytics_col_status()}</th>
					<th class={head}>{m.running()}</th>
					<th class={head}>{m.waiting()}</th>
					<th class="px-2 py-2 text-left font-normal">{m.model_analytics_kv_cache()}</th>
					<th class={head}>{m.model_analytics_col_gen()}</th>
					<th class={head}>{m.model_analytics_col_memory()}</th>
					<th class={head}>{m.model_analytics_col_gpu_memory()}</th>
					<th class="py-2 pl-2 text-right font-normal whitespace-nowrap">
						{m.model_analytics_col_restarts()}
					</th>
				</tr>
			</thead>
			<tbody>
				{#if state === 'loading'}
					{#each [0, 1] as i (i)}
						<tr class="h-12 border-b last:border-0">
							<td class="pr-2" colspan="10"><Skeleton class="h-3 w-full" /></td>
						</tr>
					{/each}
				{:else if state === 'error' || pods.length === 0}
					<tr class="h-12">
						<td colspan="10" class="text-xs text-muted-foreground">
							{state === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
						</td>
					</tr>
				{:else}
					{#each pods as pod (pod.name)}
						{@const running = n?.engine.running?.get(pod.name)}
						{@const waiting = n?.engine.waiting?.get(pod.name)}
						{@const kv = n?.engine.kv?.get(pod.name)}
						{@const gen = n?.engine.gen?.get(pod.name)}
						{@const memUsed = n?.kube.memUsed?.get(pod.name)}
						{@const memLimit = n?.kube.memLimit?.get(pod.name)}
						{@const restarts = n?.kube.restarts?.get(pod.name)}
						{@const gpu = podGpuMemory(pod, n?.gpuUsed ?? new Map(), n?.tenants ?? new Map())}
						<tr class="h-12 border-b last:border-0">
							<!-- Fixed widths: a longer name never squeezes the numbers. It loses its middle,
							     not the suffix that tells pods apart, and the tooltip shows it whole. -->
							<td class="py-1.5 pr-2">{@render name(pod.name, 2, 'max-w-[14rem]')}</td>
							<td class="px-2">
								{#if pod.node}{@render node(pod.node)}{:else}{DASH}{/if}
							</td>
							<td class="px-2">
								<Status tone={pod.status.tone} variant="dot" class="text-[0.78rem] font-medium">
									{statusLabel[pod.status.key]()}
								</Status>
							</td>
							<td class={cell}>{fmtCount(running)}</td>
							<td class={cn(cell, waitingClass(waiting))}>{fmtCount(waiting)}</td>
							<td class="px-2">
								<span class="flex w-28 items-center gap-2">
									<Meter value={kv} class={kvClass(kv) ?? 'text-foreground'} />
									<span
										class={cn(
											'w-9 text-right',
											NUM,
											kvClass(kv) ?? (kv === undefined && 'text-muted-foreground')
										)}
									>
										{fmtPercent(kv)}
									</span>
								</span>
							</td>
							<td class={cell}>{fmtRate(gen)}</td>
							<td class={cell}>
								{memUsed === undefined
									? DASH
									: `${fmtGiB(memUsed)} / ${memLimit ? fmtGiB(memLimit) : DASH} GiB`}
							</td>
							<td class={cell}>
								{gpu.quota === undefined
									? DASH
									: `${gpu.used === undefined ? DASH : fmtGiB(gpu.used)} / ${fmtGiB(gpu.quota)} GiB`}
							</td>
							<td class={cn('pl-2 text-right', NUM, (restarts ?? 0) >= 0.5 && 'text-chart-1')}>
								{fmtCount(restarts)}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</Card.Root>
