<script lang="ts">
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

	// Threshold-colored percentage + thin progress bar + capacity sub-line.
	// Shared by the CPU / RAM / Pods / FileSystem KPI cells so they stay identical.
	let {
		pct,
		subLine,
		decimals = 1
	}: { pct: number; subLine: string; decimals?: number } = $props();

	const level = $derived(classifyThreshold(pct, { green: 70, orange: 90 }));
	// A figure that is fine stays in the text color: only warning and critical are colored.
	const textClass = $derived(level === 'green' ? '' : thresholdClasses(level).text);
	const barClass = $derived(
		level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-warning' : 'bg-success'
	);
	const width = $derived(Math.min(100, Math.max(0, pct)));
</script>

<div class="flex flex-col gap-2">
	<p class="text-2xl leading-8 font-semibold tracking-tight tabular-nums {textClass}">
		{pct.toFixed(decimals)} %
	</p>
	<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
		<div
			class="h-full rounded-full {barClass} transition-all duration-500"
			style="width: {width}%"
		></div>
	</div>
	<p class="text-xs text-muted-foreground tabular-nums">{subLine}</p>
</div>
