<script lang="ts" module>
	import type { Tone } from './tone';

	export type ResourceRow = {
		label: string;
		/** 0 to 100; over 100 when overcommitted. `undefined` leaves the row out. */
		percent: number | undefined;
		/**
		 * `pressure` colors the row by how close it is to saturation. `neutral` is for a
		 * figure where high is not bad: GPU utilization, a busy disk.
		 */
		kind?: 'pressure' | 'neutral';
	};
</script>

<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';

	import { Button } from '$lib/components/shadcnio/button';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { cn } from '$lib/utils';

	import Meter from './meter.svelte';
	import { pressureTone, toneText } from './tone';
	import WidgetCard from './widget-card.svelte';

	let {
		title,
		description,
		tooltip,
		state = 'ready',
		total,
		totalLabel,
		rows,
		notes = []
	}: {
		title: string;
		description?: string;
		/** A longer explanation behind the info button. */
		tooltip?: string;
		state?: 'ready' | 'loading' | 'empty';
		/** What the percentages are of: 128 core, 1003 GB. */
		total?: { value: string | number; unit?: string };
		totalLabel?: string;
		rows: ResourceRow[];
		/** Plain label and value lines under the bars. */
		notes?: { label: string; value: string }[];
	} = $props();

	const shown = $derived(rows.filter((row) => row.percent !== undefined));

	function rowTone(row: ResourceRow): Tone {
		return row.kind === 'neutral' ? 'primary' : pressureTone(row.percent);
	}
</script>

<!--
	One resource against its capacity. Each figure is a bar on the same 0 to 100 scale, so usage,
	request and limit can be compared by length, and the color says how close each is to full.
-->
<WidgetCard {title} {description} {state} contentClass="flex flex-col gap-4">
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
	{#if total}
		<p class="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
			{total.value}
			{#if total.unit}
				<span class="text-base font-medium text-muted-foreground">{total.unit}</span>
			{/if}
			{#if totalLabel}
				<span class="ms-1 text-xs font-normal tracking-normal text-muted-foreground"
					>{totalLabel}</span
				>
			{/if}
		</p>
	{/if}
	<dl class="flex flex-col gap-3">
		{#each shown as row (row.label)}
			{@const tone = rowTone(row)}
			{@const percent = Math.round(Number(row.percent ?? 0))}
			<div class="space-y-1.5">
				<div class="flex items-baseline justify-between gap-2 text-sm">
					<dt class="text-muted-foreground">{row.label}</dt>
					<dd
						class={cn(
							'font-medium tabular-nums',
							row.kind === 'neutral' || tone === 'success' ? 'text-foreground' : toneText[tone]
						)}
					>
						{percent} %
					</dd>
				</div>
				<Meter value={Math.min(100, Math.max(0, percent))} label={row.label} {tone} />
			</div>
		{/each}
	</dl>
	{#if notes.length}
		<dl class="mt-auto flex flex-col gap-1 border-t pt-3 text-sm">
			{#each notes as note (note.label)}
				<div class="flex items-baseline justify-between gap-2">
					<dt class="text-muted-foreground">{note.label}</dt>
					<dd class="font-medium tabular-nums">{note.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</WidgetCard>
