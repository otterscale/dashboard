<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { Snippet } from 'svelte';

	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import type { WidgetState } from './index';

	// The dashboard card: a title row, then a body that keeps its size while it loads or has
	// nothing to show. Give it a min-height through `class` when the body's height matters.
	let {
		title,
		description,
		tooltip,
		showDescription = false,
		state = 'ready',
		class: className,
		bodyClass,
		compact = false,
		actions,
		badge,
		children
	}: {
		title: string;
		description?: string;
		tooltip?: string;
		/**
		 * Show the description under the title. Off by default: it stays in the info tooltip, so a
		 * card opens on its data. Turn on only where the line is needed to read the values.
		 */
		showDescription?: boolean;
		state?: WidgetState;
		class?: string;
		bodyClass?: string;
		/** A one-line body: the loading placeholder is one line too. */
		compact?: boolean;
		actions?: Snippet;
		/** Sits right after the title, e.g. a count. */
		badge?: Snippet;
		children: Snippet;
	} = $props();

	const hint = $derived(tooltip ?? (showDescription ? undefined : description));
</script>

<Card.Root
	class={cn(
		'@container/panel h-full gap-0 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:px-5 @md:py-[1.125rem]',
		className
	)}
>
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			{#if badge}
				<div class="flex min-w-0 items-center gap-2">
					<Card.Title class="truncate text-sm leading-5 font-[550]">{title}</Card.Title>
					{@render badge()}
				</div>
			{:else}
				<Card.Title class="text-sm leading-5 font-[550]">{title}</Card.Title>
			{/if}
			{#if description && showDescription}
				<Card.Description class="truncate text-xs leading-4" title={description}>
					{description}
				</Card.Description>
			{/if}
		</div>
		<div class="-mt-1 -mr-1.5 flex shrink-0 items-center gap-1">
			{@render actions?.()}
			{#if hint}
				<Tooltip.Root>
					<Tooltip.Trigger
						class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
						aria-label={title}
					>
						<InfoIcon class="size-4 text-muted-foreground" />
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs">
						<p>{hint}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>
	<div class={cn('flex min-h-0 flex-1 flex-col pt-3', bodyClass)}>
		{#if state === 'loading'}
			<Skeleton class="h-7 w-24" />
			{#if !compact}
				<Skeleton class="mt-2 h-3 w-32" />
				<Skeleton class="mt-auto h-3 w-full" />
			{/if}
		{:else if state === 'empty'}
			<p
				class={cn(
					'text-muted-foreground',
					compact && 'flex items-baseline gap-2 text-[1.75rem] leading-7'
				)}
			>
				<span class={cn(!compact && 'block text-[1.75rem] leading-8')} aria-hidden="true">—</span>
				<span class="text-xs leading-4">{m.no_data_display()}</span>
			</p>
		{:else if state === 'error'}
			<p
				class={cn(
					'text-muted-foreground',
					compact && 'flex items-baseline gap-2 text-[1.75rem] leading-7'
				)}
			>
				<span class={cn(!compact && 'block text-[1.75rem] leading-8')} aria-hidden="true">—</span>
				<span class="text-xs leading-4">{m.dashboard_couldnt_load()}</span>
			</p>
		{:else}
			{@render children()}
		{/if}
	</div>
</Card.Root>
