<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';

	import * as Statistics from '$lib/components/custom/statistics/index';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import type { TopBar } from './types';

	let {
		title,
		description,
		tooltip,
		bars,
		isLoaded,
		onBarClick,
		scrollable
	}: {
		title: string;
		description: string;
		tooltip: string;
		bars: TopBar[];
		isLoaded: boolean;
		onBarClick?: (label: string) => void;
		// When true, the list lives in a fixed-height scroll area with a maximize button — so
		// cards sharing a row stay the same height regardless of how many bars each has.
		// Leave false to let the list grow with its content.
		scrollable?: boolean;
	} = $props();

	const maxValue = $derived(bars.reduce((m, b) => Math.max(m, b.value), 0));
</script>

{#snippet barContent(bar: TopBar)}
	{@const pct = maxValue > 0 ? Math.max(2, (bar.value / maxValue) * 100) : 0}
	<span class="flex flex-col gap-1 overflow-hidden">
		<span class="flex items-center gap-1.5 overflow-hidden">
			<span class="truncate text-xs font-medium" title={bar.label}>{bar.label}</span>
			{#if bar.badge}
				<Badge variant="secondary" class="shrink-0">{bar.badge}</Badge>
			{/if}
		</span>
		<span class="relative h-2.5 w-full overflow-hidden rounded bg-muted">
			<span
				class={cn('absolute inset-y-0 left-0 rounded bg-chart-1', bar.barClass)}
				style="width: {pct}%"
			></span>
		</span>
	</span>
	<span class={cn('font-mono text-sm tabular-nums', bar.textClass)}>{bar.displayValue}</span>
{/snippet}

{#snippet list()}
	<ul class="flex flex-col gap-2">
		{#each bars as bar (bar.id ?? bar.label)}
			<li>
				{#if onBarClick}
					<button
						type="button"
						class="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/60"
						onclick={() => onBarClick?.(bar.id ?? bar.label)}
					>
						{@render barContent(bar)}
					</button>
				{:else}
					<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1 py-1">
						{@render barContent(bar)}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{title}
			</Statistics.Title>
			<!-- Keep descriptions short (one line) so cards sharing a row keep identical header
			heights and their bar lists stay vertically aligned; the full explanation lives in the
			tooltip. -->
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
		{#if scrollable}
			<Sheet.Root>
				<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
					<Maximize2Icon class="size-5 text-muted-foreground" />
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
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
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
			<div class="flex h-65 w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
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
