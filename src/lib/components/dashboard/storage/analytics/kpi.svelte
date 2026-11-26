<script lang="ts">
	import { NUM, Tile, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';

	// One number of the picked pool, OSD or PVC: the value in its level's colour, an optional bar
	// (with a line at a warning level) and a line of context. A Tile, so it keeps its size loading.
	let {
		label,
		state,
		value,
		tone,
		bar,
		mark,
		note,
		tooltip
	}: {
		label: string;
		state: WidgetState;
		value: string;
		/** Text colour of the value, e.g. a warning. */
		tone?: string;
		/** 0–100; leave out for no bar. */
		bar?: number;
		/** 0–100: a short upright line across the bar. */
		mark?: number;
		note: string;
		tooltip?: string;
	} = $props();
</script>

<!-- Loading draws its own placeholder in the body's shape, so the card does not grow on arrival. -->
<Tile {label} state={state === 'loading' ? 'ready' : state} {tooltip}>
	{#snippet body()}
		{#if state === 'loading'}
			<Skeleton class="h-8 w-20" />
			<span class="mt-2.5 block h-1.5" aria-hidden="true"></span>
			<div class="mt-2 min-h-8"><Skeleton class="h-3 w-28" /></div>
		{:else}
			{@render loaded()}
		{/if}
	{/snippet}
</Tile>

{#snippet loaded()}
	<p class={cn('truncate text-[1.75rem] leading-8 tracking-tight', NUM, tone)}>{value}</p>
	<!-- A card without a bar keeps its room, so values and notes line up across the row. -->
	{#if bar === undefined}
		<span class="mt-2.5 block h-1.5" aria-hidden="true"></span>
	{:else}
		<span class="relative mt-2.5 block h-1.5 rounded-full bg-muted" aria-hidden="true">
			<span
				class="absolute inset-y-0 left-0 rounded-full bg-chart-3"
				style:width="{Math.min(100, Math.max(0.6, bar))}%"
			></span>
			{#if mark !== undefined}
				<span
					class="absolute -inset-y-0.75 -ml-px w-0.5 rounded-full bg-foreground"
					style:left="{Math.min(100, mark)}%"
				></span>
			{/if}
		</span>
	{/if}
	<!-- Two lines held for every note, so the values line up whatever the notes say. -->
	<p class="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground" title={note}>
		{note}
	</p>
{/snippet}
