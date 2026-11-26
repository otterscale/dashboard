<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

	import { byLabel, fetchInstant, fetchRange, rangeLiteral, stats, stepFor } from '../lib/fetch';
	import { fmt, fmtGpuGiB, fmtPct, GIB } from '../lib/format';
	import { Loader } from '../lib/loader.svelte';
	import { nodeGpuHistoryQueries, nodeGpuWindowQueries } from '../lib/promql';
	import Sparkline from '../sparkline.svelte';

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
						model: (s.labels.modelName ?? '').replace(/^NVIDIA\s+/, ''),
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

	onMount(() => {
		loader.load();
	});

	const tempClass = (t?: number) =>
		t !== undefined && t >= 80
			? thresholdClasses(classifyThreshold(t, { green: 79.999, orange: 89.999 })).text
			: '';
</script>

<Panel title={m.analytics_gpus()} state={loader.state} class="min-h-60">
	{#snippet actions()}
		<span class="mt-1.5 mr-1 text-xs text-muted-foreground">
			{m.analytics_each_line({ window: windowLabel })}
		</span>
	{/snippet}
	<div class="-mx-1 overflow-x-auto px-1">
		<table class="w-full min-w-[48rem] border-collapse text-[0.8125rem] {NUM}">
			<thead class="text-xs text-muted-foreground">
				<tr class="border-b border-border">
					<th class="w-44 px-3 py-2 text-left font-medium">{m.analytics_device()}</th>
					<th class="px-3 py-2 text-left font-medium" colspan="2">{m.analytics_utilization()}</th>
					<th class="px-3 py-2 text-left font-medium" colspan="2">{m.analytics_memory_used()}</th>
					<th class="px-3 py-2 text-right font-medium">{m.analytics_temperature_peak()}</th>
					<th class="px-3 py-2 text-right font-medium">{m.analytics_power_avg()}</th>
				</tr>
			</thead>
			<tbody>
				{#each loader.data ?? [] as row (row.uuid)}
					<tr class="border-b border-border/60 last:border-b-0">
						<td class="px-3 py-2.5">
							<span class="block font-mono text-xs">{row.device}</span>
							<span class="block truncate text-xs text-muted-foreground" title={row.model}
								>{row.model}</span
							>
						</td>
						<td class="w-[22%] px-3 py-2.5"><Sparkline values={row.util} max={100} /></td>
						<td class="px-3 py-2.5 whitespace-nowrap">
							<span class="font-[550]">{fmtPct(row.utilNow)}</span>
							<span class="ml-1 text-xs text-muted-foreground">
								{m.analytics_avg({ value: fmtPct(row.utilAvg) })}
							</span>
						</td>
						<td class="w-[22%] px-3 py-2.5"><Sparkline values={row.used} max={row.total} /></td>
						<td class="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
							{fmtGpuGiB(row.usedNow)} / {fmt((row.total ?? 0) / GIB, 1)} GiB
						</td>
						<td class="px-3 py-2.5 text-right whitespace-nowrap {tempClass(row.tempPeak)}">
							{fmt(row.tempPeak)} °C
						</td>
						<td class="px-3 py-2.5 text-right whitespace-nowrap">{fmt(row.powerAvg)} W</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Panel>
