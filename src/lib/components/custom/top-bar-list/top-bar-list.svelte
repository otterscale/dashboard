<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	import * as Statistics from '$lib/components/custom/statistics/index';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import type { ActivityState } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import type { TopBar } from './types';

	let {
		title,
		description,
		tooltip,
		bars,
		isLoaded,
		onBarClick,
		scrollable,
		activity
	}: {
		title: string;
		description: string;
		tooltip: string;
		bars: TopBar[];
		isLoaded: boolean;
		onBarClick?: (label: string) => void;
		// Optional: when the caller can tell "the workload is idle" apart from "nothing is
		// deployed", pass it so the empty state says which. Omit for the generic message.
		activity?: ActivityState;
		// When true, the list lives in a fixed-height scroll area with a maximize button — so
		// cards sharing a row stay the same height regardless of how many bars each has.
		// Leave false to let the list grow with its content.
		scrollable?: boolean;
	} = $props();

	const maxValue = $derived(bars.reduce((m, b) => Math.max(m, b.value), 0));
</script>

<!-- The value shares the label's line instead of holding a column of its own, and the track spans
     the full row beneath them. A value column is as wide as its longest string, so it used to take
     bar width in proportion to how much a card had to say — the cards with the most to show got the
     shortest bars, and no two cards' bars were drawn at the same scale. -->
{#snippet barContent(bar: TopBar)}
	{@const pct = maxValue > 0 ? Math.max(2, (bar.value / maxValue) * 100) : 0}
	<span class="flex items-baseline gap-2">
		<span class="flex min-w-0 flex-1 items-center gap-1.5">
			<span class="truncate text-xs font-medium" title={bar.label}>{bar.label}</span>
			{#if bar.badge}
				<Badge variant="secondary" class="shrink-0">{bar.badge}</Badge>
			{/if}
		</span>
		<span class={cn('shrink-0 font-mono text-sm whitespace-nowrap tabular-nums', bar.textClass)}>
			{#if bar.warning}
				<!-- Ahead of the value, not after it: the value column is flush with the card's right
				     edge, so a trailing marker pushes its own row's digits left and breaks the column
				     the other rows line up on. Projected onto a span because the whole row is already
				     a <button> when the list is clickable, and a nested button would be invalid. -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span {...props} class="mr-1 cursor-help">
								<TriangleAlertIcon class="inline size-3 shrink-0 align-[-1px] text-chart-1" />
								<span class="sr-only">{bar.warning}</span>
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>
						<span class="whitespace-nowrap">{bar.warning}</span>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}{bar.displayValue}
		</span>
	</span>
	<span class="relative h-2.5 w-full overflow-hidden rounded bg-muted">
		<span
			class={cn('absolute inset-y-0 left-0 rounded bg-chart-1', bar.barClass)}
			style="width: {pct}%"
		></span>
	</span>
{/snippet}

{#snippet list()}
	<ul class="flex flex-col gap-2">
		{#each bars as bar (bar.id ?? bar.label)}
			<li>
				{#if onBarClick}
					<button
						type="button"
						class="group flex w-full flex-col gap-1 rounded px-1 py-1 text-left hover:bg-muted/60"
						onclick={() => onBarClick?.(bar.id ?? bar.label)}
					>
						{@render barContent(bar)}
					</button>
				{:else}
					<div class="flex flex-col gap-1 px-1 py-1">
						{@render barContent(bar)}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<!-- Both lines are clamped to one line rather than merely kept short by convention: a header
		     that wraps pushes its own bar list down while its neighbours stay put, and the row of
		     cards loses the shared baseline that makes their bars comparable. `min-w-0` is what lets
		     the truncation happen at all — this is a flex item, and its default `min-width: auto`
		     would size it to the text instead. Anything cut off stays readable on hover, and the
		     tooltip button beside it carries the full explanation either way. -->
		<div class="grid min-w-0 flex-1 gap-1">
			<Statistics.Title class="truncate text-base leading-normal text-foreground" {title}>
				{title}
			</Statistics.Title>
			<p class="truncate text-sm text-muted-foreground" title={description}>{description}</p>
		</div>
		{#if scrollable}
			<Sheet.Root>
				<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
					<Maximize2Icon class="size-4 text-muted-foreground" />
				</Sheet.Trigger>
				<Sheet.Content class="flex min-w-[38vw] flex-col gap-4 overflow-auto p-8">
					<Sheet.Header class="p-0">
						<Sheet.Title>{title}</Sheet.Title>
						<Sheet.Description>{description}</Sheet.Description>
					</Sheet.Header>
					{@render list()}
				</Sheet.Content>
			</Sheet.Root>
		{/if}
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
				<InfoIcon class="size-4 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-65 w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if bars.length === 0}
			<div class="flex h-65 w-full flex-col items-center justify-center gap-1">
				{#if activity === 'idle'}
					<MoonIcon class="size-12 text-muted-foreground" />
					<p class="text-base text-muted-foreground">{m.no_traffic_display()}</p>
					<p class="text-xs text-muted-foreground">{m.no_traffic_hint()}</p>
				{:else}
					<ChartLine class="size-12 animate-pulse text-muted-foreground" />
					<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
				{/if}
			</div>
		{:else if scrollable}
			<ScrollArea class="h-65 w-full">
				{@render list()}
			</ScrollArea>
		{:else}
			{@render list()}
		{/if}
	</Statistics.Content>
</Statistics.Root>
