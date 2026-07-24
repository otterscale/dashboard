<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { Component } from 'svelte';
	import type { Snippet } from 'svelte';

	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';

	// Shared shell for the Node Detail KPI cards. Mirrors the flat overview cards
	// (decorative background icon + three-tier header + loader/empty/content branches).
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
		icon: Component;
		isLoaded: boolean;
		isEmpty: boolean;
		children: Snippet;
	} = $props();
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Icon
		class="pointer-events-none absolute -right-10 bottom-0 size-36 text-primary/5"
		aria-hidden="true"
	/>
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{title}</Card.Title>
			<Card.Description class="line-clamp-2">{description}</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if isEmpty}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		{@render children()}
	{/if}
</Card.Root>
