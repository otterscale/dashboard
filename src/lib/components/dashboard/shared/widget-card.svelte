<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import type { Snippet } from 'svelte';

	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/shadcnio/card';
	import { Spinner } from '$lib/components/shadcnio/spinner';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		action,
		state = 'ready',
		message,
		class: className,
		contentClass,
		children
	}: {
		title: string;
		description?: string;
		/** Sits at the top right of the header: a toggle, a hint. */
		action?: Snippet;
		/** `loading` and `empty` replace the content, so every widget waits and fails the same way. */
		state?: 'ready' | 'loading' | 'empty' | 'message';
		/** The text for `state="message"`. */
		message?: string;
		class?: string;
		contentClass?: string;
		children?: Snippet;
	} = $props();
</script>

<Card class={cn('h-full', className)}>
	<CardHeader>
		<CardTitle class="text-base leading-6 font-semibold">{title}</CardTitle>
		{#if description}
			<CardDescription class="text-sm">{description}</CardDescription>
		{/if}
		{#if action}
			<CardAction class="row-span-2 self-start">{@render action()}</CardAction>
		{/if}
	</CardHeader>
	{#if state === 'loading'}
		<CardContent class="flex min-h-32 flex-1 items-center justify-center">
			<Spinner class="size-6 text-muted-foreground" />
		</CardContent>
	{:else if state === 'empty'}
		<CardContent
			class="flex min-h-32 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground"
		>
			<ChartBar class="size-8 opacity-60" />
			<p class="text-sm">{m.no_data_display()}</p>
		</CardContent>
	{:else if state === 'message'}
		<CardContent class="text-sm text-muted-foreground">{message}</CardContent>
	{:else}
		<CardContent class={cn('flex-1', contentClass)}>
			{@render children?.()}
		</CardContent>
	{/if}
</Card>
