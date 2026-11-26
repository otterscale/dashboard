<script lang="ts">
	import type { Component } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { cn } from '$lib/utils';

	// A whole card that says there is nothing to show: what is missing, why, and up to two ways
	// forward. It takes the place of the content, so `class` gives it that content's height.
	let {
		Icon,
		title,
		description,
		href,
		hrefLabel,
		onAction,
		actionLabel,
		class: className
	}: {
		Icon: Component<{ class?: string }>;
		title: string;
		description: string;
		/** A place to go, already resolved by the caller. */
		href?: string;
		hrefLabel?: string;
		/** Something to do here, e.g. widen the window. */
		onAction?: () => void;
		actionLabel?: string;
		class?: string;
	} = $props();

	// The vendored link button in the dashboard's link colour, with the page's 36px target.
	const link = 'border-0 px-1.5 text-chart-2 underline-offset-auto';
</script>

<Empty.Root
	class={cn(
		'flex-none gap-0 rounded-2xl bg-card px-6 py-12 text-wrap shadow-(--card-frame)',
		className
	)}
>
	<Empty.Header class="max-w-none gap-0">
		<Empty.Media variant="icon" class="mb-0 size-12 rounded-xl text-muted-foreground">
			<Icon class="size-5" />
		</Empty.Media>
		<Empty.Title role="heading" aria-level={2} class="mt-4 leading-7 font-semibold tracking-normal">
			{title}
		</Empty.Title>
		<Empty.Description class="mt-2 max-w-md text-sm/5">{description}</Empty.Description>
	</Empty.Header>
	{#if (href && hrefLabel) || (onAction && actionLabel)}
		<Empty.Content class="mt-4 max-w-none flex-row flex-wrap justify-center gap-x-3 gap-y-0">
			{#if href && hrefLabel}
				<Button variant="link" {href} class={link}>{hrefLabel}</Button>
			{/if}
			{#if onAction && actionLabel}
				<Button variant="link" class={link} onclick={onAction}>{actionLabel}</Button>
			{/if}
		</Empty.Content>
	{/if}
</Empty.Root>
