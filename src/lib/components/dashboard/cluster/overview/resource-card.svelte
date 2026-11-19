<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { LoadStatus } from '$lib/components/dashboard/shared/loadable.svelte';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';

	// The shape shared by the CPU, Memory, GPU and aiDAPTIVCache cards: the size
	// of the pool as one big reading, then a meter per quantity measured against it.
	let {
		title,
		description,
		info,
		status,
		stale,
		emptyTitle,
		capacity,
		unit,
		capacityLabel,
		children
	}: {
		title: string;
		description?: string;
		info?: string;
		status: LoadStatus;
		stale: boolean;
		emptyTitle?: string;
		/** The size of the pool, already formatted, without its unit. */
		capacity: string;
		unit?: string;
		capacityLabel: string;
		/** The meters. */
		children: Snippet;
	} = $props();
</script>

<WidgetCard {title} {description} {info} {status} {stale} {emptyTitle} bodyClass="min-h-52 gap-4">
	{#snippet skeleton()}
		<div class="grid gap-1.5">
			<Skeleton class="h-7 w-28" />
			<Skeleton class="h-3 w-20" />
		</div>
		{#each [0, 1, 2] as row (row)}
			<div class="grid gap-2">
				<div class="flex justify-between">
					<Skeleton class="h-4 w-20" />
					<Skeleton class="h-4 w-12" />
				</div>
				<Skeleton class="h-1.5 w-full" />
			</div>
		{/each}
	{/snippet}
	<div class="grid min-w-0 gap-0.5">
		<p class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-2xl leading-8 font-medium">
			<span class="tabular-nums">{capacity}</span>
			{#if unit}<span class="text-sm font-normal text-muted-foreground">{unit}</span>{/if}
		</p>
		<p class="text-xs text-muted-foreground">{capacityLabel}</p>
	</div>
	{@render children()}
</WidgetCard>
