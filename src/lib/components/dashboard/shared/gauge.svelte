<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import { ArcChart, Text } from 'layerchart';

	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { type Tone, toneColor } from './tone';

	let {
		ratio,
		primary,
		secondary,
		tone = 'primary',
		class: className
	}: {
		/** 0 to 1. `null` when there is nothing to draw: the query failed or returned nothing. */
		ratio: number | null;
		/** The large text in the middle, usually a percentage. */
		primary?: string;
		/** The small text under it, usually "used / total". */
		secondary?: string;
		tone?: Tone;
		class?: string;
	} = $props();

	const color = $derived(toneColor[tone]);
	const chartConfig = $derived({ data: { color } } satisfies Chart.ChartConfig);
</script>

{#if ratio === null}
	<div
		class={cn(
			'flex h-[168px] w-full flex-col items-center justify-center gap-1 text-muted-foreground',
			className
		)}
	>
		<ChartBar class="size-8 opacity-60" />
		<p class="text-xs">{m.no_data_display()}</p>
	</div>
{:else}
	<Chart.Container
		config={chartConfig}
		class={cn('mx-auto aspect-square h-[168px] w-full max-w-[220px]', className)}
	>
		<ArcChart
			data={[{ value: Math.max(0, Math.min(1, ratio)) }]}
			innerRadius={-13}
			cornerRadius={12}
			range={[-120, 120]}
			maxValue={1}
			series={[{ key: 'data', color }]}
			props={{ arc: { track: { fill: 'var(--muted)' }, motion: 'tween' } }}
			tooltipContext={false}
		>
			{#snippet aboveMarks()}
				{#if primary}
					<Text
						value={primary}
						textAnchor="middle"
						verticalAnchor="middle"
						class="fill-foreground text-[1.75rem]! font-semibold tabular-nums"
						dy={secondary ? -10 : 0}
					/>
				{/if}
				{#if secondary}
					<Text
						value={secondary}
						textAnchor="middle"
						verticalAnchor="middle"
						class="fill-muted-foreground text-xs! font-normal tabular-nums"
						dy={16}
					/>
				{/if}
			{/snippet}
		</ArcChart>
	</Chart.Container>
{/if}
