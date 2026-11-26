<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { Meter, NUM, Tile } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';

	import { fetchInstant, scalar } from '../lib/fetch';
	import { fmt, fmtCores, fmtGiB, GIB, pressureText } from '../lib/format';
	import { Loader } from '../lib/loader.svelte';
	import { nodeKpiQueries } from '../lib/promql';

	// Node detail, Now: five numbers, each a share of what the node can give.
	let {
		client,
		tick,
		node,
		instance
	}: { client: PrometheusDriver; tick: number; node: string; instance: string | undefined } =
		$props();

	type Kpis = Record<string, number | undefined> & { model?: string };

	const loader = new Loader<Kpis>(
		async () => {
			const r = await fetchInstant(client, nodeKpiQueries(node, instance));
			if (!r) return null;
			const out: Kpis = {};
			for (const [k, samples] of Object.entries(r)) out[k] = scalar(samples);
			out.model = r.gpuModel?.[0]?.labels.modelName;
			return out;
		},
		(k) => k.cpuAlloc === undefined && k.memAlloc === undefined
	);

	$effect(() => {
		void tick;
		untrack(() => loader.load());
	});

	const k = $derived(loader.data ?? {});
	const pct = (a?: number, b?: number) => (a !== undefined && b ? (a / b) * 100 : undefined);
	const cpuPct = $derived(pct(k.cpuUsed, k.cpuAlloc));
	const memPct = $derived(pct(k.memUsed, k.memAlloc));
	const gpuPct = $derived(pct(k.gpuAlloc ?? 0, k.gpuCap));
	const podPct = $derived(pct(k.pods, k.podsAlloc));
	const fsUsed = $derived(
		k.fsSize !== undefined && k.fsAvail !== undefined ? k.fsSize - k.fsAvail : undefined
	);
	const fsPct = $derived(pct(fsUsed, k.fsSize));
	const hasGpu = $derived((k.gpuCards ?? 0) > 0);
	const perCard = $derived(hasGpu && k.gpuCap ? k.gpuCap / (k.gpuCards ?? 1) : undefined);
	const model = $derived((k.model ?? '').replace(/^NVIDIA\s+/, ''));
</script>

{#snippet figure(value: string, unit: string, meter: number | undefined, note: string, tone = '')}
	<p class="truncate text-[1.75rem] leading-8 tracking-tight {NUM}">
		<span class={tone}>{value}</span><span
			class="ml-1 text-sm tracking-normal text-muted-foreground">{unit}</span
		>
	</p>
	<Meter value={meter} class="mt-2" />
	<p class="mt-2 truncate text-xs leading-4 text-muted-foreground" title={note}>{note}</p>
{/snippet}

<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
	<Tile label={m.analytics_cpu_usage()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmt(cpuPct),
				'%',
				cpuPct,
				m.analytics_of_cores({ used: fmtCores(k.cpuUsed), total: fmt(k.cpuAlloc) })
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_memory_usage()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmt(memPct),
				'%',
				memPct,
				m.analytics_of_gib({ used: fmtGiB(k.memUsed), total: fmtGiB(k.memAlloc) })
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_gpu_memory_allocated()} state={loader.state}>
		{#snippet body()}
			{#if hasGpu}
				{@render figure(
					fmt(gpuPct),
					'%',
					gpuPct,
					m.analytics_gpu_cards({
						count: String(k.gpuCards),
						model,
						size: fmt((perCard ?? 0) / GIB, 1)
					}),
					pressureText(gpuPct)
				)}
			{:else}
				{@render figure('—', '', 0, m.analytics_no_gpus_on_node())}
			{/if}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_pods()} state={loader.state}>
		{#snippet body()}
			{@render figure(
				fmt(k.pods),
				m.analytics_of_count({ total: fmt(k.podsAlloc) }),
				podPct,
				m.analytics_pct_of_pod_capacity({ pct: fmt(podPct) })
			)}
		{/snippet}
	</Tile>
	<Tile label={m.analytics_file_system()} state={instance ? loader.state : 'empty'}>
		{#snippet body()}
			{@render figure(
				fmt(fsPct),
				'%',
				fsPct,
				m.analytics_of_gib({ used: fmtGiB(fsUsed), total: fmtGiB(k.fsSize) })
			)}
		{/snippet}
	</Tile>
</div>
