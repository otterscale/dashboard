<script lang="ts" module>
	export type RankMetric = 'cpu' | 'memory' | 'gpu' | 'restarts';

	export type RankValue = {
		text: string;
		class?: string;
		/** Hidden at phone width. */ minor?: boolean;
	};

	export type RankRow = {
		id: string;
		label: string;
		/** Written in the # column instead of the row's position, e.g. "—" for a total row. */
		rank?: string;
		/** Shown on hover, e.g. the workspace that owns a namespace. */
		title?: string;
		chips: string[];
		/** Dark bar (usage), light bar (request or allocation), both 0–100 of the track. */
		bar?: {
			solid: number;
			soft?: number;
			over?: boolean;
			softClass?: string;
			/** A short upright line across the track at this share, e.g. a warning level. */
			mark?: number;
		};
		/** Replaces bar and values, e.g. "No GPU". */
		note?: string;
		/** Colour of the note, e.g. a warning for "Starting". */
		noteClass?: string;
		values: RankValue[];
		trend?: number[];
		sortKey: number;
	};
</script>

<script lang="ts" generics="T extends string = RankMetric">
	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { NUM } from '$lib/components/dashboard/kit';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import Chip from './chip.svelte';
	import Segmented from './segmented.svelte';
	import Sparkline from './sparkline.svelte';

	// The ranking is also the picker: each row is a button, and the pressed one is what the
	// detail below shows.
	let {
		title,
		subtitle,
		metric = $bindable(),
		axisLabel,
		legend,
		headers,
		rows,
		state: status,
		selected,
		onSelect,
		history,
		trendMax,
		limit,
		metrics,
		trendLabel,
		showAllLabel,
		valueWidth = 'auto-cols-[3.5rem]',
		barFrom = '2xl'
	}: {
		title: string;
		/** Under the title; left out, the title stands alone. */
		subtitle?: string;
		metric: T;
		axisLabel: string;
		/** Labels for the dark and light bars; the light one is optional. Omit for no legend. */
		legend?: [string, string?];
		headers: { text: string; minor?: boolean }[];
		rows: RankRow[];
		state: WidgetState;
		selected: string | undefined;
		onSelect: (id: string) => void;
		history: boolean;
		trendMax?: number;
		/** Show this many rows until "Show all" is pressed. */
		limit?: number;
		/** The tabs; Cluster's four (CPU, Memory, GPU, Restarts) when left out. */
		metrics?: { value: T; label: string }[];
		/** Header of the trend column in History. */
		trendLabel?: string;
		/** "Show all N …" for the rows this card lists; namespaces when left out. */
		showAllLabel?: (count: string) => string;
		/** Width of each value column, as a Tailwind `auto-cols-*` class. */
		valueWidth?: string;
		/** The container width from which the bar shows; narrower, the values sit beside the name. */
		barFrom?: '2xl' | '5xl';
	} = $props();

	let expanded = $state(false);
	const visible = $derived(limit && !expanded ? rows.slice(0, limit) : rows);
	// A row with its own `rank` is not counted, so the rows after it still number from 1.
	const positions = $derived.by(() => {
		let n = 0;
		return visible.map((row) => row.rank ?? String(++n));
	});

	const METRICS = $derived(
		metrics ??
			([
				{ value: 'cpu', label: m.analytics_cpu() },
				{ value: 'memory', label: m.analytics_memory() },
				{ value: 'gpu', label: m.analytics_gpu() },
				{ value: 'restarts', label: m.analytics_restarts() }
			] as unknown as { value: T; label: string }[])
	);

	// Same columns for the header and every row, so values line up. The value columns are fixed
	// widths; at phone width the bar, trend and chips go, and so does any column marked minor.
	const valueCols = $derived(headers.map((h) => (h.minor ? '@max-2xl:hidden' : '')));
	const grid = $derived(
		cn(
			'grid items-center gap-x-3 px-3 @2xl:gap-x-3.5',
			barFrom === '5xl'
				? 'grid-cols-[1.5rem_minmax(0,1fr)_auto] @5xl:grid-cols-[1.5rem_minmax(8rem,22rem)_minmax(4rem,1fr)_auto]'
				: history
					? 'grid-cols-[1.5rem_minmax(0,1fr)_auto] @2xl:grid-cols-[1.5rem_minmax(8rem,22rem)_minmax(4rem,1fr)_auto_6.5rem]'
					: 'grid-cols-[1.5rem_minmax(0,1fr)_auto] @2xl:grid-cols-[1.5rem_minmax(8rem,22rem)_minmax(4rem,1fr)_auto]'
		)
	);
	const barHidden = $derived(barFrom === '5xl' ? '@max-5xl:hidden' : '@max-2xl:hidden');
	const valuesGrid = $derived(cn('grid grid-flow-col justify-end gap-x-2 text-right', valueWidth));
</script>

<section class="rounded-2xl bg-card p-4 shadow-(--card-frame) @md:px-5 @md:py-[1.125rem]">
	<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
		<div class="min-w-0">
			<h2 class="text-sm leading-5 font-[550]">{title}</h2>
			{#if subtitle}
				<p class="text-xs leading-4 text-muted-foreground">{subtitle}</p>
			{/if}
		</div>
		<Segmented
			options={METRICS}
			bind:value={metric}
			label={m.analytics_rank_by()}
			size="sm"
			class="max-w-full overflow-x-auto"
		/>
	</div>

	<div class={cn('mt-3 min-h-8 text-xs text-muted-foreground', grid)}>
		<span>#</span>
		<span class="truncate">{axisLabel}</span>
		<span class={cn('flex items-center gap-3', barHidden)} aria-hidden="true">
			{#if legend}
				<span class="flex items-center gap-1.5">
					<span class="h-1.5 w-3.5 rounded-[2px] bg-chart-3"></span>{legend[0]}
				</span>
			{/if}
			{#if legend?.[1]}
				<span class="flex items-center gap-1.5">
					<span class="h-1.5 w-3.5 rounded-[2px] bg-chart-3/28"></span>{legend[1]}
				</span>
			{/if}
		</span>
		<span class={valuesGrid}>
			{#each headers as header, i (i)}
				<span class={valueCols[i]}>{header.text}</span>
			{/each}
		</span>
		{#if history}
			<span class="text-right @max-2xl:hidden">{trendLabel ?? m.analytics_trend()}</span>
		{/if}
	</div>

	{#if status === 'loading'}
		<ul class="mt-1 flex flex-col gap-1" aria-busy="true">
			{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
				<li class={cn(grid, 'h-12')}>
					<Skeleton class="size-3" />
					<Skeleton class="h-3 w-32" />
					<Skeleton class={cn('h-1.5 w-full', barHidden)} />
					<Skeleton class="h-3 w-24 justify-self-end" />
				</li>
			{/each}
		</ul>
	{:else if status === 'error' || status === 'empty' || rows.length === 0}
		<div class="flex h-[19.5rem] flex-col justify-center px-3 text-muted-foreground">
			<p class="text-[1.75rem] leading-8" aria-hidden="true">—</p>
			<p class="text-xs leading-4">
				{status === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
			</p>
		</div>
	{:else}
		<ul class="mt-1 flex flex-col gap-1">
			{#each visible as row, i (row.id)}
				{@const on = row.id === selected}
				<li>
					<button
						type="button"
						aria-pressed={on}
						onclick={() => onSelect(row.id)}
						class={cn(
							grid,
							'min-h-12 w-full rounded-[0.625rem] py-1.5 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
							on ? 'bg-accent' : 'hover:bg-accent/60'
						)}
					>
						<span class={cn('text-xs text-muted-foreground', NUM)}>{positions[i]}</span>
						<span class="flex min-w-0 items-center gap-2" title={row.title ?? row.label}>
							<span class="truncate font-mono text-[0.8125rem]">{row.label}</span>
							{#each row.chips as chip (chip)}
								<!-- On the picked row the chip takes the card's colour, like the bar's track. -->
								<Chip class={cn('@max-2xl:hidden', on && 'bg-card')}>{chip}</Chip>
							{/each}
						</span>
						{#if row.note}
							<span
								class={cn('relative h-1.5 rounded-full', on ? 'bg-card' : 'bg-muted', barHidden)}
								aria-hidden="true"
							></span>
							<span
								class={cn('text-right text-[0.8125rem]', row.noteClass ?? 'text-muted-foreground')}
								>{row.note}</span
							>
						{:else}
							<span
								class={cn(
									// On the picked row the track takes the card's colour, or it vanishes into the row.
									'relative h-1.5 rounded-full',
									on ? 'bg-card' : 'bg-muted',
									row.bar?.mark === undefined && 'overflow-hidden',
									barHidden
								)}
								aria-hidden="true"
							>
								{#if row.bar?.soft !== undefined}
									<span
										class={cn(
											'absolute inset-y-0 left-0 rounded-full',
											row.bar.softClass ?? 'bg-chart-3/28'
										)}
										style:width="{Math.min(100, row.bar.soft)}%"
									></span>
									{#if row.bar.over}
										<span
											class="absolute inset-y-0 right-0 w-[12%] bg-[repeating-linear-gradient(135deg,var(--chart-3)_0_2px,transparent_2px_5px)]"
										></span>
									{/if}
								{/if}
								{#if row.bar}
									<span
										class="absolute inset-y-0 left-0 rounded-full bg-chart-3"
										style:width="{Math.min(100, row.bar.solid)}%"
									></span>
								{/if}
								{#if row.bar?.mark !== undefined}
									<span
										class="absolute -inset-y-0.75 -ml-px w-0.5 rounded-full bg-foreground"
										style:left="{Math.min(100, row.bar.mark)}%"
									></span>
								{/if}
							</span>
							<span class={cn(valuesGrid, 'text-[0.8125rem]', NUM)}>
								{#each row.values as value, j (j)}
									<span class={cn(value.class, valueCols[j])}>{value.text}</span>
								{/each}
							</span>
						{/if}
						{#if history}
							<span class="@max-2xl:hidden">
								<Sparkline values={row.trend ?? []} max={trendMax} />
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		{#if limit && rows.length > limit}
			<Button
				variant="link"
				class="mt-2 px-3 text-[0.8125rem] text-chart-2 underline-offset-auto"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded
					? m.analytics_show_fewer()
					: showAllLabel
						? showAllLabel(String(rows.length))
						: m.analytics_show_all({ count: String(rows.length) })}
			</Button>
		{/if}
	{/if}
</section>
