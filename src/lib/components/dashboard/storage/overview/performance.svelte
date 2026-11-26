<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { type DataPoint, fetchCombinedFlattenedRange } from '$lib/prometheus';

	import { fmtIops, fmtMs, fmtRate } from './format';
	import { LAYOUT } from './layout';
	import PerfChart from './perf-chart.svelte';
	import { performanceQueries } from './queries';

	// Throughput, operations and latency over the picked window, read and write on each chart.
	// One request for all three; a new window (a pick, or auto update sliding one that ends now)
	// refetches while the last answer stays on screen.
	let { client, start, end }: { client: PrometheusDriver; start: Date; end: Date } = $props();

	let data = $state<DataPoint[]>([]);
	let loaded = $state(false);
	let failed = $state(false);
	let request = 0;

	async function load(from: number, to: number) {
		const id = ++request;
		// About 200 points across the window, no finer than a minute. The rate window is 5 min, or
		// the step when that is longer, so no sample falls between two points.
		const step = Math.max(60, Math.ceil((to - from) / 1000 / 200));
		try {
			const points = await fetchCombinedFlattenedRange(
				client,
				performanceQueries(Math.max(300, step)),
				new Date(from),
				new Date(to),
				step
			);
			if (id !== request) return;
			data = points;
			failed = false;
		} catch (error) {
			if (id !== request) return;
			console.error('Failed to fetch storage performance:', error);
			failed = true;
		}
		loaded = true;
	}

	$effect(() => {
		void load(start.getTime(), end.getTime());
	});

	const has = (key: string) => data.some((d) => typeof d[key] === 'number');
	const stateFor = (read: string, write: string) => {
		const hasData = has(read) || has(write);
		return widgetState(loaded, hasData, failed && !hasData);
	};
</script>

<div class={LAYOUT.chart}>
	<PerfChart
		title={m.throughput()}
		{data}
		readKey="readBytes"
		writeKey="writeBytes"
		format={fmtRate}
		state={stateFor('readBytes', 'writeBytes')}
	/>
</div>
<div class={LAYOUT.chart}>
	<PerfChart
		title={m.storage_operations()}
		{data}
		readKey="readOps"
		writeKey="writeOps"
		format={fmtIops}
		state={stateFor('readOps', 'writeOps')}
	/>
</div>
<div class={LAYOUT.chart}>
	<PerfChart
		title={m.latency()}
		description={m.storage_latency_subtitle()}
		{data}
		readKey="readLatency"
		writeKey="writeLatency"
		format={fmtMs}
		state={stateFor('readLatency', 'writeLatency')}
	/>
</div>
