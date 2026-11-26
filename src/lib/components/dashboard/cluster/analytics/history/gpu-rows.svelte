<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import {
		byLabel,
		fetchInstant,
		fetchRange,
		rangeLiteral,
		stats,
		stepFor
	} from '$lib/components/dashboard/kit/fetch';
	import { fmt, fmtGpuGiB, fmtPct, GIB } from '$lib/components/dashboard/kit/format';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import Sparkline from '$lib/components/dashboard/kit/sparkline.svelte';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { gpuModelName } from '../lib/gpu-cards';
	import { nodeGpuHistoryQueries, nodeGpuWindowQueries } from '../lib/promql';

	// History: one row per card. Utilisation and memory as lines, temperature peak and mean power.
	let {
		client,
		node,
		start,
		end,
		windowLabel
	}: { client: PrometheusDriver; node: string; start: Date; end: Date; windowLabel: string } =
		$props();

	type Row = {
		uuid: string;
		device: string;
		model: string;
		util: number[];
		used: number[];
		utilNow?: number;
		utilAvg?: number;
		usedNow?: number;
		total?: number;
		tempPeak?: number;
		powerAvg?: number;
	};

	const loader = new Loader<Row[]>(
		async () => {
			const [range, window] = await Promise.all([
				fetchRange(client, nodeGpuHistoryQueries(node), start, end, stepFor(start, end, 60)),
				fetchInstant(client, nodeGpuWindowQueries(node, rangeLiteral(start, end)), end)
			]);
			if (!range || !window) return null;
			const total = byLabel(window.total, 'UUID');
			const utilAvg = byLabel(window.utilAvg, 'UUID');
			const tempPeak = byLabel(window.tempPeak, 'UUID');
			const powerAvg = byLabel(window.powerAvg, 'UUID');
			const used = new Map(range.used.map((s) => [s.labels.UUID, s]));
			return range.util
				.map((s) => {
					const uuid = s.labels.UUID;
					const mem = used.get(uuid);
					return {
						uuid,
						device: s.labels.device ?? uuid,
						model: gpuModelName(s.labels.modelName),
						util: s.points.map((p) => p.v),
						used: mem?.points.map((p) => p.v) ?? [],
						utilNow: stats(s).last,
						utilAvg: utilAvg.get(uuid),
						usedNow: stats(mem).last,
						total: total.get(uuid),
						tempPeak: tempPeak.get(uuid),
						powerAvg: powerAvg.get(uuid)
					};
				})
				.sort((a, b) => a.device.localeCompare(b.device, undefined, { numeric: true }));
		},
		(rows) => rows.length === 0
	);

	// A new window starts from the loading rows; the page remounts this card for a new node.
	$effect(() => {
		void [start.getTime(), end.getTime()];
		untrack(() => {
			loader.reset();
			loader.load();
		});
	});

	const tempClass = (t?: number) =>
		t !== undefined && t >= 80
			? thresholdClasses(classifyThreshold(t, { green: 79.999, orange: 89.999 })).text
			: '';

	// The vendored table at this card's density: 13px, tighter rows, no row hover.
	const ROW = 'border-border/60 hover:bg-transparent';
	const HEAD = 'h-auto px-3 py-2 whitespace-normal text-muted-foreground';
	const CELL = 'px-3 py-2.5';
</script>

<Panel title={m.analytics_gpus()} state={loader.state} class="min-h-60">
	{#snippet actions()}
		<span class="mt-1.5 mr-1 text-xs text-muted-foreground">
			{m.analytics_each_line({ window: windowLabel })}
		</span>
	{/snippet}
	<Table.Root class={cn('min-w-[48rem] border-collapse text-[0.8125rem]', NUM)}>
		<Table.Header class="text-xs">
			<Table.Row class="hover:bg-transparent">
				<Table.Head class={cn(HEAD, 'w-44')}>{m.analytics_device()}</Table.Head>
				<Table.Head class={HEAD} colspan={2}>{m.analytics_utilization()}</Table.Head>
				<Table.Head class={HEAD} colspan={2}>{m.analytics_memory_used()}</Table.Head>
				<Table.Head class={cn(HEAD, 'text-right')}>{m.analytics_temperature_peak()}</Table.Head>
				<Table.Head class={cn(HEAD, 'text-right')}>{m.analytics_power_avg()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each loader.data ?? [] as row (row.uuid)}
				<Table.Row class={ROW}>
					<Table.Cell class={cn(CELL, 'whitespace-normal')}>
						<span class="block font-mono text-xs">{row.device}</span>
						<span class="block truncate text-xs text-muted-foreground" title={row.model}
							>{row.model}</span
						>
					</Table.Cell>
					<Table.Cell class={cn(CELL, 'w-[22%]')}>
						<Sparkline values={row.util} max={100} />
					</Table.Cell>
					<Table.Cell class={CELL}>
						<span class="font-[550]">{fmtPct(row.utilNow)}</span>
						<span class="ml-1 text-xs text-muted-foreground">
							{m.analytics_avg({ value: fmtPct(row.utilAvg) })}
						</span>
					</Table.Cell>
					<Table.Cell class={cn(CELL, 'w-[22%]')}>
						<Sparkline values={row.used} max={row.total} />
					</Table.Cell>
					<Table.Cell class={cn(CELL, 'text-right font-mono text-xs')}>
						{fmtGpuGiB(row.usedNow)} / {fmt((row.total ?? 0) / GIB, 1)} GiB
					</Table.Cell>
					<Table.Cell class={cn(CELL, 'text-right', tempClass(row.tempPeak))}>
						{fmt(row.tempPeak)} °C
					</Table.Cell>
					<Table.Cell class={cn(CELL, 'text-right')}>{fmt(row.powerAvg)} W</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</Panel>
