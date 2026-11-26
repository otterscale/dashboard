<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { Meter, NUM, Status, TONE_TEXT } from '$lib/components/dashboard/kit';
	import { byLabel, fetchInstant } from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import type { SharedMetrics } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { DASH, fmtCount, fmtPercent, fmtRate } from '../../overview/lib/models';
	import { CATEGORY_COLORS } from '../lib/chart-style';
	import type { ModelPods } from '../lib/model-pods';
	import {
		byDeviceUuid,
		byNode,
		fmtPodGiB,
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
			return { gpuUsed: byDeviceUuid(used), tenants: byDeviceUuid(tenants) };
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

	// The vendored table at this card's density: 32px header, 48px rows, no row hover.
	const row = 'h-12 hover:bg-transparent';
	// 33px: the old header's 32px of text and padding plus its rule.
	const head = 'h-[2.0625rem] font-normal text-muted-foreground';
	const plain = 'py-0 whitespace-normal';
	const cell = cn('py-0 text-right', NUM);
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
	{@const [start, tail] = splitTail(full, segments)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span
					{...props}
					class={cn('flex min-w-0 font-mono text-[0.78rem]', width)}
					aria-label={full}
				>
					<span class="truncate">{start}</span><span class="shrink-0">{tail}</span>
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
	<!-- The table scrolls sideways inside the card; its 4px margin keeps a focus ring whole. -->
	<div class="-mx-1 mt-2">
		<Table.Root class="mx-1 w-[calc(100%-0.5rem)] min-w-[56rem] text-[0.8125rem]">
			<Table.Header class="text-xs">
				<Table.Row class="hover:bg-transparent">
					<Table.Head class={cn(head, 'pl-0 whitespace-normal')}>
						{m.model_analytics_col_pod()}
					</Table.Head>
					<Table.Head class={cn(head, 'whitespace-normal')}>{m.node()}</Table.Head>
					<Table.Head class={cn(head, 'whitespace-normal')}>
						{m.model_analytics_col_status()}
					</Table.Head>
					<Table.Head class={cn(head, 'text-right')}>{m.running()}</Table.Head>
					<Table.Head class={cn(head, 'text-right')}>{m.waiting()}</Table.Head>
					<Table.Head class={cn(head, 'whitespace-normal')}>
						{m.model_analytics_kv_cache()}
					</Table.Head>
					<Table.Head class={cn(head, 'text-right')}>{m.model_analytics_col_gen()}</Table.Head>
					<Table.Head class={cn(head, 'text-right')}>{m.model_analytics_col_memory()}</Table.Head>
					<Table.Head class={cn(head, 'text-right')}>
						{m.model_analytics_col_gpu_memory()}
					</Table.Head>
					<Table.Head class={cn(head, 'pr-0 text-right')}>
						{m.model_analytics_col_restarts()}
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if state === 'loading'}
					{#each [0, 1] as i (i)}
						<Table.Row class={row}>
							<Table.Cell class={cn(plain, 'pr-2 pl-0')} colspan={10}>
								<Skeleton class="h-3 w-full" />
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else if state === 'error' || pods.length === 0}
					<Table.Row class={row}>
						<Table.Cell class={cn(plain, 'px-0 text-xs text-muted-foreground')} colspan={10}>
							{state === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
						</Table.Cell>
					</Table.Row>
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
						<Table.Row class={row}>
							<!-- Fixed widths: a longer name never squeezes the numbers. It loses its middle,
							     not the suffix that tells pods apart, and the tooltip shows it whole. -->
							<Table.Cell class={cn(plain, 'py-1.5 pr-2 pl-0')}>
								{@render name(pod.name, 2, 'max-w-[14rem]')}
							</Table.Cell>
							<Table.Cell class={plain}>
								{#if pod.node}{@render node(pod.node)}{:else}{DASH}{/if}
							</Table.Cell>
							<Table.Cell class={plain}>
								<Status tone={pod.status.tone} variant="dot" class="text-[0.78rem] font-medium">
									{statusLabel[pod.status.key]()}
								</Status>
							</Table.Cell>
							<Table.Cell class={cell}>{fmtCount(running)}</Table.Cell>
							<Table.Cell class={cn(cell, waitingClass(waiting))}>{fmtCount(waiting)}</Table.Cell>
							<Table.Cell class={plain}>
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
							</Table.Cell>
							<Table.Cell class={cell}>{fmtRate(gen)}</Table.Cell>
							<Table.Cell class={cell}>
								{memUsed === undefined
									? DASH
									: `${fmtPodGiB(memUsed)} / ${memLimit ? fmtPodGiB(memLimit) : DASH} GiB`}
							</Table.Cell>
							<Table.Cell class={cell}>
								{gpu.quota === undefined
									? DASH
									: `${gpu.used === undefined ? DASH : fmtPodGiB(gpu.used)} / ${fmtPodGiB(gpu.quota)} GiB`}
							</Table.Cell>
							<Table.Cell
								class={cn(
									'py-0 pr-0 text-right whitespace-normal',
									NUM,
									(restarts ?? 0) >= 0.5 && TONE_TEXT.warn
								)}
							>
								{fmtCount(restarts)}
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</Card.Root>
