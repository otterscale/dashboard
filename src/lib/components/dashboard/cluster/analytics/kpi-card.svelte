<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { Component } from 'svelte';
	import type { Snippet } from 'svelte';

	import { Button } from '$lib/components/shadcnio/button';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { m } from '$lib/messages';

	// Shared cell for the Node Detail and Namespace Detail KPI bands: the same connected cells
	// as the overview tab (see dashboard/shared/band.svelte), with a title line that carries the
	// explanation behind an info button. Loading swaps only the figure, so nothing moves.
	let {
		title,
		description,
		tooltip,
		icon: Icon,
		isLoaded,
		isEmpty,
		children
	}: {
		title: string;
		description: string;
		tooltip: string;
		icon: Component<{ class?: string }>;
		isLoaded: boolean;
		isEmpty: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="flex h-full min-w-0 flex-col gap-2 bg-card px-4 py-4 sm:px-5">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<p class="flex items-center gap-1.5 text-sm font-medium">
				<Icon class="size-4 shrink-0 text-muted-foreground" />
				<span class="truncate">{title}</span>
			</p>
			<p class="mt-0.5 truncate text-xs text-muted-foreground" title={description}>
				{description}
			</p>
		</div>
		<Tooltip>
			<TooltipTrigger>
				{#snippet asChild(props)}
					<Button {...props({ class: '-me-1.5 -mt-1 shrink-0' })} variant="ghost" size="icon-sm">
						<InfoIcon class="text-muted-foreground" />
						<span class="sr-only">{tooltip}</span>
					</Button>
				{/snippet}
			</TooltipTrigger>
			<TooltipContent class="max-w-xs">{tooltip}</TooltipContent>
		</Tooltip>
	</div>
	{#if !isLoaded}
		<Skeleton class="h-8 w-20" />
	{:else if isEmpty}
		<p class="text-2xl leading-8 font-semibold text-muted-foreground" aria-hidden="true">—</p>
		<p class="text-xs text-muted-foreground">{m.no_data_display()}</p>
	{:else}
		{@render children()}
	{/if}
</div>
