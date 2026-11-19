<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Component } from 'svelte';

	import type { LoadStatus } from '$lib/components/dashboard/shared/loadable.svelte';
	import { type Level, levelText } from '$lib/components/dashboard/shared/status';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Badge } from '$lib/components/shadcnio/badge';
	import { Button } from '$lib/components/shadcnio/button';
	import { Progress } from '$lib/components/shadcnio/progress';
	import {
		Sheet,
		SheetBody,
		SheetContent,
		SheetHeader,
		SheetTrigger
	} from '$lib/components/shadcnio/sheet';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import type { RankingLegend, RankingRow } from './ranking';

	// A ranked list in a card: one row per item, a name and a reading on the first line and a
	// thin bar under them. The card shows the top rows; the full list opens in a sheet.
	let {
		title,
		description,
		info,
		rows,
		status = 'ready',
		stale = false,
		onRowClick,
		legend,
		visible = 5,
		emptyTitle,
		emptyDescription,
		emptyIcon,
		class: className
	}: {
		title: string;
		description?: string;
		info?: string;
		rows: RankingRow[];
		status?: LoadStatus;
		stale?: boolean;
		/** Makes every row a button. Receives the row's `id`, or its label. */
		onRowClick?: (id: string) => void;
		/** Colour key for stacked bars. Shown in the sheet. */
		legend?: RankingLegend;
		/** Rows shown in the card before "show all". */
		visible?: number;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyIcon?: Component;
		class?: string;
	} = $props();

	const maxValue = $derived(rows.reduce((max, row) => Math.max(max, row.value), 0));
	// Where the reading goes, decided for the whole list so every row has the same shape. A short
	// one sits beside the name. Three readings in one string never fit there and go on a line of
	// their own. In between, it depends on how wide the card is (a container query).
	const longest = $derived(rows.reduce((max, row) => Math.max(max, row.displayValue.length), 0));
	const layout = $derived<'row' | 'auto' | 'stack'>(
		longest > 18 ? 'stack' : longest > 8 ? 'auto' : 'row'
	);
	const shown = $derived(rows.slice(0, visible));

	let open = $state(false);

	// Written out in full so Tailwind sees each class.
	const fill: Record<Level, string> = {
		ok: '[&_[data-slot=progress-indicator]]:bg-primary',
		neutral: '[&_[data-slot=progress-indicator]]:bg-primary',
		warn: '[&_[data-slot=progress-indicator]]:bg-warning',
		danger: '[&_[data-slot=progress-indicator]]:bg-destructive'
	};
	// Only a row past a threshold is coloured; a healthy reading stays in the text colour.
	function valueClass(level: Level | undefined): string {
		return level === 'warn' || level === 'danger' ? levelText[level] : '';
	}

	function pick(row: RankingRow) {
		open = false;
		onRowClick?.(row.id ?? row.label);
	}
</script>

{#snippet rowContent(row: RankingRow)}
	{@const percent = maxValue > 0 ? Math.max(2, (row.value / maxValue) * 100) : 0}
	{@const levelClass = valueClass(row.level)}
	<div
		class={cn(
			'flex min-w-0 gap-x-3 gap-y-0.5',
			layout === 'row' && 'items-center',
			layout === 'stack' && 'flex-col',
			layout === 'auto' && 'flex-col @[13.5rem]:flex-row @[13.5rem]:items-center'
		)}
	>
		<div class="flex min-w-0 flex-1 items-center gap-1.5">
			{#if onRowClick}
				<!-- The button is the name; its ::after covers the whole row, so the row is one target
				     without nesting the bar and the warning mark inside a button. -->
				<button
					type="button"
					class="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
					title={row.label}
					onclick={() => pick(row)}
				>
					{row.label}
				</button>
			{:else}
				<span class="min-w-0 truncate text-sm font-medium" title={row.label}>{row.label}</span>
			{/if}
			{#if row.badge}
				<Badge variant="secondary" size="sm" class="px-1.5 text-[0.6875rem]">{row.badge}</Badge>
			{/if}
			{#if row.warning}
				<Tooltip>
					<TooltipTrigger>
						{#snippet asChild(props)}
							<span
								{...props({
									class:
										'relative z-10 inline-flex shrink-0 cursor-help items-center text-warning-foreground'
								})}
							>
								<TriangleAlertIcon class="size-3.5" aria-hidden="true" />
								<span class="sr-only">{row.warning}</span>
							</span>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{row.warning}</TooltipContent>
				</Tooltip>
			{/if}
		</div>
		<div
			class={cn(
				'font-mono text-xs tabular-nums',
				layout === 'row' && 'shrink-0 text-right whitespace-nowrap',
				layout === 'stack' && 'min-w-0',
				layout === 'auto' &&
					'min-w-0 @[13.5rem]:shrink-0 @[13.5rem]:text-right @[13.5rem]:whitespace-nowrap',
				// A reading on its own line is secondary to the name, unless its level colours it.
				!levelClass && layout === 'stack' && 'text-muted-foreground',
				!levelClass && layout === 'auto' && 'text-muted-foreground @[13.5rem]:text-foreground',
				levelClass
			)}
		>
			{row.displayValue}
		</div>
	</div>
	{#if row.segments}
		<div class="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
			<div class="flex h-full overflow-hidden rounded-full" style="width: {percent}%">
				{#each row.segments as segment, i (i)}
					<span class={cn('h-full', segment.class)} style="flex: {segment.value} 1 0"></span>
				{/each}
			</div>
		</div>
	{:else}
		<Progress
			aria-label={row.label}
			value={percent}
			class={cn(
				'[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-track]]:h-1.5',
				fill[row.level ?? 'neutral']
			)}
		/>
	{/if}
{/snippet}

{#snippet list(items: RankingRow[])}
	<ul class="@container flex min-w-0 flex-col gap-1">
		{#each items as row (row.id ?? row.label)}
			<li
				class={cn(
					'relative flex min-w-0 flex-col gap-1.5 rounded-md px-2 py-1.5',
					onRowClick && 'hover:bg-muted/60'
				)}
			>
				{@render rowContent(row)}
			</li>
		{/each}
	</ul>
{/snippet}

<WidgetCard
	{title}
	{description}
	{info}
	{status}
	{stale}
	{emptyTitle}
	{emptyDescription}
	{emptyIcon}
	class={className}
	bodyClass="min-h-60"
>
	{#snippet skeleton()}
		<div class="flex flex-col gap-1" aria-hidden="true">
			{#each { length: visible }, i (i)}
				<div class="flex flex-col gap-1.5 px-2 py-1.5">
					<div class="flex items-center justify-between gap-3">
						<Skeleton class="h-5 w-2/5" />
						<Skeleton class="h-4 w-1/4" />
					</div>
					<Skeleton class="h-1.5 w-full rounded-full" />
				</div>
			{/each}
		</div>
	{/snippet}

	<div class="-mx-2 flex min-w-0 flex-1 flex-col gap-2">
		{@render list(shown)}
		{#if rows.length > visible}
			<Sheet {open} onOpenChange={(details) => (open = details.open)}>
				<SheetTrigger>
					{#snippet asChild(props)}
						<Button
							{...props({ class: 'mx-2 mt-auto self-start text-muted-foreground' })}
							variant="ghost"
							size="xs"
						>
							{m.dash_show_all()}
							<span class="font-mono tabular-nums">({rows.length})</span>
						</Button>
					{/snippet}
				</SheetTrigger>
				<SheetContent class="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
					<SheetHeader {title} {description} class="pe-12" />
					<SheetBody class="flex flex-col gap-3 px-2 pb-4">
						{#if legend && legend.length > 0}
							<ul
								class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground"
							>
								{#each legend as item (item.label)}
									<li class="flex items-center gap-1.5">
										<span class={cn('size-2 shrink-0 rounded-full', item.class)} aria-hidden="true"
										></span>
										<span>{item.label}</span>
									</li>
								{/each}
							</ul>
						{/if}
						{@render list(rows)}
					</SheetBody>
				</SheetContent>
			</Sheet>
		{/if}
	</div>
</WidgetCard>
