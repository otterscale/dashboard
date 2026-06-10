<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

	// Big threshold-colored percentage + thin progress bar + capacity sub-line.
	// Shared by the CPU / RAM / Swap / FileSystem KPI cards so they stay identical.
	let {
		pct,
		subLine,
		decimals = 1
	}: { pct: number; subLine: string; decimals?: number } = $props();

	const level = $derived(classifyThreshold(pct, { green: 70, orange: 90 }));
	const textClass = $derived(thresholdClasses(level).text);
	const barClass = $derived(
		level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2'
	);
	const width = $derived(Math.min(100, Math.max(0, pct)));
</script>

<Card.Content class="mt-1 flex flex-col gap-3">
	<p class="text-3xl font-bold {textClass}">{pct.toFixed(decimals)} %</p>
	<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
		<div
			class="h-full rounded-full {barClass} transition-all duration-500"
			style="width: {width}%"
		></div>
	</div>
	<p class="text-sm text-muted-foreground">{subLine}</p>
</Card.Content>
