<script lang="ts" module>
	export type Ring = {
		key: string;
		label: string;
		/** 0 to 100; over 100 when overcommitted. `undefined` leaves the ring out. */
		percent: number | undefined;
		/** The ring's color: which ring is which. A CSS color. */
		color: string;
		/**
		 * `pressure` flags the readout as it nears and passes capacity. `neutral` is for a figure
		 * where high is not bad: GPU utilization, a busy disk.
		 */
		kind?: 'pressure' | 'neutral';
	};
</script>

<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import { ArcChart, Text } from 'layerchart';

	import { Button } from '$lib/components/shadcnio/button';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { pressureTone, toneText } from './tone';
	import WidgetCard from './widget-card.svelte';

	let {
		title,
		description,
		tooltip,
		state = 'ready',
		onretry,
		total,
		totalLabel,
		rings,
		notes = []
	}: {
		title: string;
		description?: string;
		/** A longer explanation behind the info button. */
		tooltip?: string;
		state?: 'ready' | 'loading' | 'empty' | 'error';
		onretry?: () => void;
		/** What the percentages are of, drawn in the middle: 128 core, 1003 GB. */
		total?: { value: string | number; unit?: string };
		/** What kind of total that is: allocatable, capacity. */
		totalLabel?: string;
		/** Outer ring first. */
		rings: Ring[];
		/** Plain label and value lines under the readout. */
		notes?: { label: string; value: string }[];
	} = $props();

	const shown = $derived(rings.filter((ring) => ring.percent !== undefined));
	const chartConfig = $derived(
		Object.fromEntries(shown.map((ring) => [ring.key, { label: ring.label, color: ring.color }]))
	);

	// The arc's own scale stops at 100: an overcommitted figure closes its ring, and the readout
	// below says by how much. Past a full turn it would wrap and read as a small value.
	const arc = (percent: number | undefined) => Math.min(100, Math.max(0, Number(percent ?? 0)));
</script>

<!--
	From shadcn.io stats-concentric-rings-card: nested rings over a readout whose rows share
	hairlines. The rings show the shape at a glance, the readout carries the exact figures.
-->
<WidgetCard {title} {description} {state} {onretry} flush>
	{#snippet action()}
		{#if tooltip}
			<Tooltip>
				<TooltipTrigger>
					{#snippet asChild(props)}
						<Button {...props({ class: '-me-1.5 -mt-1' })} variant="ghost" size="icon-sm">
							<InfoIcon class="text-muted-foreground" />
							<span class="sr-only">{tooltip}</span>
						</Button>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent class="max-w-xs">{tooltip}</TooltipContent>
			</Tooltip>
		{/if}
	{/snippet}
	{#snippet skeleton()}
		<div class="flex flex-col items-center gap-4 pb-4">
			<Skeleton class="size-[168px] rounded-full" />
			<div class="flex w-full flex-col gap-3 px-(--card-spacing)">
				{#each rings as ring (ring.key)}
					<Skeleton class="h-4 w-full" />
				{/each}
			</div>
		</div>
	{/snippet}
	<div class="flex h-full flex-col">
		<Chart.Container config={chartConfig} class="mx-auto aspect-square h-[168px] max-w-full">
			<ArcChart
				value="value"
				outerRadius={-8}
				innerRadius={-9}
				padding={11}
				range={[180, -180]}
				maxValue={100}
				series={shown.map((ring) => ({
					key: ring.key,
					data: [{ key: ring.key, value: arc(ring.percent) }],
					color: ring.color
				}))}
				props={{ arc: { track: { fill: 'var(--muted)' }, motion: 'tween' } }}
				tooltipContext={false}
			>
				{#snippet aboveMarks()}
					{#if total}
						<Text
							value={String(total.value)}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-xl! font-semibold tabular-nums"
							dy={total.unit ? -8 : 0}
						/>
						{#if total.unit}
							<Text
								value={totalLabel ? `${total.unit} ${totalLabel}` : total.unit}
								textAnchor="middle"
								verticalAnchor="middle"
								class="fill-muted-foreground text-[11px]! font-normal"
								dy={12}
							/>
						{/if}
					{/if}
				{/snippet}
			</ArcChart>
		</Chart.Container>
		<dl class="mt-3 flex flex-1 flex-col gap-px border-t bg-border">
			{#each shown as ring (ring.key)}
				{@const percent = Math.round(Number(ring.percent ?? 0))}
				{@const tone = ring.kind === 'neutral' ? 'default' : pressureTone(percent)}
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-card px-(--card-spacing) py-2 text-sm"
				>
					<dt class="flex min-w-0 items-center gap-2">
						<span
							aria-hidden="true"
							class="size-2.5 shrink-0 rounded-full"
							style="background-color: {ring.color}"
						></span>
						<span class="truncate">{ring.label}</span>
						{#if ring.kind !== 'neutral' && percent > 100}
							<span class="shrink-0 text-xs text-destructive">{m.over_capacity()}</span>
						{/if}
					</dt>
					<dd
						class={cn(
							'font-medium tabular-nums',
							tone === 'success' || tone === 'default' ? 'text-foreground' : toneText[tone]
						)}
					>
						<bdi>{percent} %</bdi>
					</dd>
				</div>
			{/each}
			{#each notes as note (note.label)}
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-card px-(--card-spacing) py-2 text-sm"
				>
					<dt class="truncate text-muted-foreground">{note.label}</dt>
					<dd class="font-medium tabular-nums"><bdi>{note.value}</bdi></dd>
				</div>
			{/each}
			<!-- Soaks up the leftover height in the card's color, so short readouts don't show the rule color. -->
			<div class="flex-1 bg-card" aria-hidden="true"></div>
		</dl>
	</div>
</WidgetCard>
