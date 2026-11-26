<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { Meter, NUM, Panel, Tile } from '$lib/components/dashboard/kit';
	import { byLabel, byPod, fetchInstant, scalar } from '$lib/components/dashboard/kit/fetch';
	import {
		DASH,
		fmt,
		fmtCores,
		fmtGiB,
		fmtPct,
		pressureText,
		sum
	} from '$lib/components/dashboard/kit/format';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { namespaceNowQueries } from '../lib/promql';

	// Namespace detail, Now: five numbers, its pods, and its volumes. One request feeds all three.
	let {
		client,
		tick,
		namespace
	}: {
		client: PrometheusDriver;
		tick: number;
		/** Left out while the page has no namespace yet: the cards then wait in their loading state. */
		namespace: string | undefined;
	} = $props();

	type Pod = {
		pod: string;
		node: string;
		cpu: [number?, number?, number?];
		memory: [number?, number?, number?];
		gpus: number;
	};
	type Volume = {
		name: string;
		storageClass: string;
		requested?: number;
		used?: number;
		capacity?: number;
	};
	type Data = {
		pods: Pod[];
		running?: number;
		restarts?: number;
		gpuUtil?: number;
		volumes: Volume[];
	};

	const loader = new Loader<Data>(async () => {
		if (!namespace) return null;
		const r = await fetchInstant(client, namespaceNowQueries(namespace));
		if (!r) return null;
		const maps = (
			['cpuUse', 'cpuReq', 'cpuLim', 'memUse', 'memReq', 'memLim', 'gpuCards'] as const
		).map((k) => byPod(r[k]));
		const [cpuUse, cpuReq, cpuLim, memUse, memReq, memLim, gpuCards] = maps;
		const pods = r.pods
			.map(({ labels }) => {
				const key = `${labels.namespace}/${labels.pod}`;
				return {
					pod: labels.pod,
					node: labels.node ?? '',
					cpu: [cpuUse.get(key), cpuReq.get(key), cpuLim.get(key)] as Pod['cpu'],
					memory: [memUse.get(key), memReq.get(key), memLim.get(key)] as Pod['memory'],
					gpus: gpuCards.get(key) ?? 0
				};
			})
			.sort((a, b) => (b.cpu[1] ?? 0) - (a.cpu[1] ?? 0) || a.pod.localeCompare(b.pod));
		const requested = byLabel(r.pvcRequest, 'persistentvolumeclaim');
		const used = byLabel(r.pvcUsed, 'persistentvolumeclaim');
		const capacity = byLabel(r.pvcCapacity, 'persistentvolumeclaim');
		const volumes = r.pvcInfo
			.map(({ labels }) => ({
				name: labels.persistentvolumeclaim,
				storageClass: labels.storageclass ?? '',
				requested: requested.get(labels.persistentvolumeclaim),
				used: used.get(labels.persistentvolumeclaim),
				capacity: capacity.get(labels.persistentvolumeclaim)
			}))
			.sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || a.name.localeCompare(b.name));
		return {
			pods,
			running: scalar(r.running),
			restarts: scalar(r.restarts),
			gpuUtil: scalar(r.gpuUtil),
			volumes
		};
	});

	$effect(() => {
		void tick;
		if (!namespace) return;
		untrack(() => loader.load());
	});

	const d = $derived(loader.data);
	const total = (i: 0 | 1 | 2, key: 'cpu' | 'memory') =>
		sum((d?.pods ?? []).map((p) => p[key][i] ?? 0));
	const gpus = $derived(sum((d?.pods ?? []).map((p) => p.gpus)));
	const mounted = $derived((d?.volumes ?? []).filter((v) => v.used !== undefined));
	const storageUsed = $derived(sum(mounted.map((v) => v.used ?? 0)));
	const storageRequested = $derived(sum((d?.volumes ?? []).map((v) => v.requested ?? 0)));
	const podsState = $derived(
		loader.state === 'ready' && (d?.pods.length ?? 0) === 0 ? 'empty' : loader.state
	);
	// The vendored table at this card's density: 13px, tighter rows, no row hover.
	const ROW = 'border-border/60 hover:bg-transparent';
	const HEAD = 'h-auto px-2.5 py-2 text-right whitespace-normal text-muted-foreground';
	const CELL = 'px-2.5 py-2.5 text-right';
	const DIVIDED = 'border-l border-border';
</script>

{#snippet figure(value: string, unit: string, note: string)}
	<p class={cn('truncate text-[1.75rem] leading-8 tracking-tight', NUM)}>
		{value}<span class="ml-1 text-sm tracking-normal text-muted-foreground">{unit}</span>
	</p>
	<p class="mt-1 truncate text-xs leading-4 text-muted-foreground" title={note}>{note}</p>
{/snippet}

<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
	<Tile label={m.analytics_pods()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmt(d?.running),
				'',
				m.analytics_restarts_last_hour({ count: fmt(d?.restarts ?? 0) })
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_cpu_request()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmtCores(total(1, 'cpu')),
				m.analytics_unit_cores(),
				m.analytics_usage_limit({
					usage: fmtCores(total(0, 'cpu')),
					limit: fmtCores(total(2, 'cpu'))
				})
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_memory_request()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmtGiB(total(1, 'memory')),
				m.analytics_unit_gib(),
				m.analytics_usage_limit({
					usage: fmtGiB(total(0, 'memory')),
					limit: fmtGiB(total(2, 'memory'))
				})
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_gpus()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				gpus > 0 ? fmt(gpus) : DASH,
				'',
				gpus > 0 || d?.gpuUtil !== undefined
					? m.analytics_average_utilization({ pct: fmtPct(d?.gpuUtil) })
					: m.analytics_no_gpu_workloads()
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_storage()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				mounted.length > 0 ? fmtGiB(storageUsed) : DASH,
				mounted.length > 0 ? m.analytics_unit_gib() : '',
				(d?.volumes.length ?? 0) > 0
					? m.analytics_pvcs_requested({
							count: String(d?.volumes.length),
							requested: fmtGiB(storageRequested)
						})
					: m.analytics_no_volumes()
			)}
		{/snippet}
	</Tile>
</div>

<div class="grid gap-2 @md:gap-3 @5xl:grid-cols-[3fr_2fr]">
	<Panel title={m.analytics_pods()} state={podsState} class="min-h-72">
		{#snippet actions()}
			<span class="mt-1.5 mr-1 text-xs text-muted-foreground">{m.analytics_pods_units()}</span>
		{/snippet}
		<Table.Root class={cn('min-w-[36rem] border-collapse text-[0.8125rem]', NUM)}>
			<Table.Header class="text-xs">
				<Table.Row class="hover:bg-transparent">
					<Table.Head class={cn(HEAD, 'text-left')}>{m.analytics_pod()}</Table.Head>
					<Table.Head class={cn(HEAD, 'text-left')}>{m.analytics_node()}</Table.Head>
					<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_cpu()}</Table.Head>
					<Table.Head class={HEAD}>{m.analytics_req()}</Table.Head>
					<Table.Head class={HEAD}>{m.analytics_lim()}</Table.Head>
					<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_mem()}</Table.Head>
					<Table.Head class={HEAD}>{m.analytics_req()}</Table.Head>
					<Table.Head class={HEAD}>{m.analytics_lim()}</Table.Head>
					<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_gpus()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each d?.pods ?? [] as pod (pod.pod)}
					<Table.Row class={ROW}>
						<Table.Cell class="max-w-[14rem] px-2.5 py-2.5">
							<span class="block truncate font-mono text-xs" title={pod.pod}>{pod.pod}</span>
						</Table.Cell>
						<Table.Cell class="max-w-[8rem] px-2.5 py-2.5">
							<span class="block truncate font-mono text-xs text-muted-foreground" title={pod.node}
								>{pod.node || DASH}</span
							>
						</Table.Cell>
						<Table.Cell class={cn(CELL, DIVIDED)}>{fmtCores(pod.cpu[0])}</Table.Cell>
						<Table.Cell class={CELL}>{fmtCores(pod.cpu[1])}</Table.Cell>
						<Table.Cell class={CELL}>{fmtCores(pod.cpu[2])}</Table.Cell>
						<Table.Cell class={cn(CELL, DIVIDED)}>{fmtGiB(pod.memory[0])}</Table.Cell>
						<Table.Cell class={CELL}>{fmtGiB(pod.memory[1])}</Table.Cell>
						<Table.Cell class={CELL}>{fmtGiB(pod.memory[2])}</Table.Cell>
						<Table.Cell class={cn(CELL, DIVIDED)}>
							{pod.gpus > 0 ? fmt(pod.gpus) : DASH}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Panel>

	<Panel title={m.analytics_storage()} state={loader.state} class="min-h-72">
		{#if (d?.volumes.length ?? 0) === 0}
			<p class="text-[1.75rem] leading-8 text-muted-foreground" aria-hidden="true">{DASH}</p>
			<p class="text-xs leading-4 text-muted-foreground">{m.analytics_no_volumes()}</p>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each d?.volumes ?? [] as volume (volume.name)}
					{@const pct =
						volume.used !== undefined && volume.capacity
							? (volume.used / volume.capacity) * 100
							: undefined}
					<li class="min-w-0">
						<div class="flex items-baseline justify-between gap-3 text-[0.8125rem]">
							<span class="flex min-w-0 items-baseline gap-2">
								<span class="truncate font-mono" title={volume.name}>{volume.name}</span>
								<span class="shrink-0 truncate text-xs text-muted-foreground"
									>{volume.storageClass}</span
								>
							</span>
							<span class={cn('shrink-0 font-[550]', NUM, pressureText(pct))}>{fmtPct(pct)}</span>
						</div>
						<Meter value={pct} class="mt-1.5" />
						<p class={cn('mt-1.5 text-xs text-muted-foreground', NUM)}>
							{volume.used !== undefined
								? m.analytics_x_of_y_gib({ x: fmtGiB(volume.used), y: fmtGiB(volume.capacity) })
								: m.analytics_not_mounted({ size: fmtGiB(volume.requested) })}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>
</div>
