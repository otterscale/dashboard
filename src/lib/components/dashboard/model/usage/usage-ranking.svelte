<script lang="ts">
	import { NUM, type WidgetState } from '$lib/components/dashboard/kit';
	import Segmented from '$lib/components/dashboard/kit/segmented.svelte';
	import Sparkline from '$lib/components/dashboard/kit/sparkline.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { SOFT_FILL } from './hourly-chart.svelte';
	import type { DisplayRow } from './lib/display';
	import { viewLabel } from './lib/display';
	import { fmtCount, fmtTokensOrDash } from './lib/format';
	import { failedIsHigh, type SortKey, tokensOf, type View } from './lib/usage';

	// The ranking is also the picker: each row is a button, and the pressed one is what the
	// detail below shows.
	let {
		views,
		view = $bindable(),
		sort = $bindable(),
		rows,
		state: status,
		selected,
		onSelect,
		notice,
		limit = 10
	}: {
		views: View[];
		view: View;
		sort: SortKey;
		rows: DisplayRow[];
		state: WidgetState;
		selected: string | undefined;
		onSelect: (id: string) => void;
		/** A line above the table, e.g. why the Users view is missing. */
		notice?: string;
		limit?: number;
	} = $props();

	let expanded = $state(false);
	// "Deleted keys" is not ranked, so it stays when the list is cut to the top ten.
	const ranked = $derived(rows.filter((r) => !r.row.pinned));
	const visible = $derived(
		expanded || ranked.length <= limit
			? rows
			: [...ranked.slice(0, limit), ...rows.filter((r) => r.row.pinned)]
	);
	const maxTokens = $derived(Math.max(1, ...rows.map((r) => tokensOf(r.row.totals))));

	const viewOptions = $derived(views.map((v) => ({ value: v, label: viewLabel(v) })));
	const SORTS = $derived([
		{ value: 'tokens' as const, label: m.usage_sort_tokens() },
		{ value: 'requests' as const, label: m.usage_requests() },
		{ value: 'failed' as const, label: m.usage_failed() }
	]);

	// Same columns for the header and every row. The bar and trend go below 56rem; at phone
	// width Input and Output go too, leaving rank, name, Requests and Failed.
	const grid =
		'grid items-center gap-x-3 px-3 grid-cols-[1.5rem_minmax(0,1fr)_auto] @4xl:grid-cols-[1.5rem_minmax(10rem,18rem)_minmax(4rem,1fr)_auto_6.5rem]';
	const valuesGrid =
		'grid grid-flow-col justify-end gap-x-2 text-right auto-cols-[4rem] @max-xl:auto-cols-[3.5rem]';
	const minor = '@max-xl:hidden';
	const wide = '@max-4xl:hidden';
</script>

<section class="rounded-2xl bg-card p-4 shadow-(--card-frame) @md:px-5 @md:py-[1.125rem]">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<Segmented options={viewOptions} bind:value={view} label={m.usage_view_label()} />
		<div class="flex items-center gap-2">
			<span class="text-xs text-muted-foreground @max-xl:hidden">{m.usage_sort_by()}</span>
			<Segmented options={SORTS} bind:value={sort} label={m.usage_sort_by()} size="sm" />
		</div>
	</div>
	{#if notice}
		<p class="mt-3 rounded-lg bg-muted px-3 py-2 text-xs leading-4 text-muted-foreground">
			{notice}
		</p>
	{/if}

	<div class="mt-3 min-h-8 text-xs text-muted-foreground {grid}">
		<span>#</span>
		<span class="truncate">{viewLabel(view)}</span>
		<span class="flex items-center gap-3 {wide}" aria-hidden="true">
			<span class="flex items-center gap-1.5">
				<span class="size-2 rounded-[2px] bg-chart-3"></span>{m.usage_input()}
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-2 rounded-[2px]" style:background={SOFT_FILL}></span>{m.usage_output()}
			</span>
		</span>
		<span class={valuesGrid}>
			<span>{m.usage_requests()}</span>
			<span class={minor}>{m.usage_input()}</span>
			<span class={minor}>{m.usage_output()}</span>
			<span>{m.usage_failed()}</span>
		</span>
		<span class="text-right {wide}">{m.analytics_trend()}</span>
	</div>

	{#if status === 'loading'}
		<ul class="mt-1 flex flex-col gap-1" aria-busy="true">
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<li class="{grid} h-12">
					<Skeleton class="h-3 w-3" />
					<Skeleton class="h-3 w-32" />
					<Skeleton class="h-1.5 w-full {wide}" />
					<Skeleton class="h-3 w-24 justify-self-end" />
				</li>
			{/each}
		</ul>
	{:else if status === 'error' || rows.length === 0}
		<div class="flex h-64 flex-col justify-center px-3 text-muted-foreground">
			<p class="text-[1.75rem] leading-8" aria-hidden="true">—</p>
			<p class="text-xs leading-4">
				{status === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
			</p>
		</div>
	{:else}
		<ul class="mt-1 flex flex-col gap-1">
			{#each visible as item, i (item.id)}
				{@const on = item.id === selected}
				{@const t = item.row.totals}
				<li>
					<button
						type="button"
						aria-pressed={on}
						onclick={() => onSelect(item.id)}
						class={cn(
							grid,
							'min-h-12 w-full rounded-[0.625rem] py-1.5 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
							on ? 'bg-accent' : 'hover:bg-accent/60'
						)}
					>
						<span class="text-xs text-muted-foreground {NUM}">
							{item.row.pinned ? '–' : i + 1}
						</span>
						<span class="flex min-w-0 flex-col" title={item.title ?? item.label}>
							<span class="flex min-w-0 items-center gap-2">
								<span
									class={cn('truncate', item.mono ? 'font-mono text-[0.8125rem]' : 'font-medium')}
								>
									{item.label}
								</span>
								{#each item.chips as chip (chip)}
									<span
										class={cn(
											'shrink-0 rounded-full px-2 py-0.5 text-xs leading-4 text-muted-foreground @max-xl:hidden',
											on ? 'bg-card' : 'bg-muted'
										)}
									>
										{chip}
									</span>
								{/each}
							</span>
							<span class="truncate text-xs leading-4 text-muted-foreground">{item.sub}</span>
						</span>
						<span
							class="relative h-1.5 overflow-hidden rounded-full bg-muted {wide}"
							aria-hidden="true"
						>
							<span
								class="absolute inset-y-0 left-0"
								style:width="{(tokensOf(t) / maxTokens) * 100}%"
								style:background={SOFT_FILL}
							></span>
							<span
								class="absolute inset-y-0 left-0 bg-chart-3"
								style:width="{(t.input / maxTokens) * 100}%"
							></span>
						</span>
						<span class="{valuesGrid} text-[0.8125rem] {NUM}">
							<span>{fmtCount(t.requests)}</span>
							<span class={minor}>{fmtTokensOrDash(t.input)}</span>
							<span class={minor}>{fmtTokensOrDash(t.output)}</span>
							<span class={failedIsHigh(t) ? 'text-chart-1' : 'text-muted-foreground'}>
								{fmtCount(t.failed)}
							</span>
						</span>
						<span class={wide}>
							<Sparkline values={item.row.trend[sort]} />
						</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if ranked.length > limit}
			<button
				type="button"
				class="mt-2 inline-flex min-h-9 items-center rounded-md px-3 text-[0.8125rem] font-medium text-chart-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? m.analytics_show_fewer() : m.usage_show_all({ count: String(rows.length) })}
			</button>
		{/if}
	{/if}
</section>
