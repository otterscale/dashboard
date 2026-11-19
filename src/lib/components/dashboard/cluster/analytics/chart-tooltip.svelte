<script lang="ts">
	import { getChartContext, Tooltip } from 'layerchart';

	import { cn } from '$lib/utils';

	import { formatChartTooltipDate } from './chart';

	// The tooltip of the Analytics charts: the hovered time, then one line per series with its
	// colour key, name and formatted value. Must be rendered inside a LayerChart chart.
	let {
		format,
		highlightTop3 = false
	}: {
		format: (value: number) => string;
		/** Sets the three largest values apart, for charts with many series. */
		highlightTop3?: boolean;
	} = $props();

	const chart = getChartContext();

	const items = $derived(chart.tooltip.series.filter((item) => item.value !== undefined));
	const label = $derived.by(() => {
		const data = chart.tooltip.data;
		if (data === null || data === undefined) return '';
		const x = chart.x(data) as unknown;
		const date = x instanceof Date ? x : new Date(String(x));
		return Number.isNaN(date.getTime()) ? String(x) : formatChartTooltipDate(date);
	});
	const top3 = $derived(
		highlightTop3
			? items
					.map((item) => Number(item.value))
					.sort((a, b) => b - a)
					.slice(0, 3)
			: []
	);
</script>

<Tooltip.Root variant="none">
	<div
		class="grid min-w-36 items-start gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
	>
		{#if label}
			<div class="font-medium">{label}</div>
		{/if}
		<div class="grid gap-1.5">
			{#each items as item, i (item.key + i)}
				{@const isTop = top3.includes(Number(item.value))}
				<div class="flex w-full items-center gap-2">
					<span
						class="size-2 shrink-0 rounded-full"
						style="background: {item.color};"
						aria-hidden="true"
					></span>
					<span
						class={cn(
							'flex-1 leading-none text-muted-foreground',
							isTop && 'font-semibold text-foreground'
						)}
					>
						{item.label ?? item.key}
					</span>
					<span
						class={cn('font-mono leading-none tabular-nums', isTop ? 'font-bold' : 'font-medium')}
					>
						{format(Number(item.value))}
					</span>
				</div>
			{/each}
		</div>
	</div>
</Tooltip.Root>
