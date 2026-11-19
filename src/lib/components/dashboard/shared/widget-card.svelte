<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { Snippet } from 'svelte';

	import { Button } from '$lib/components/shadcnio/button';
	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/shadcnio/card';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		action,
		state = 'ready',
		message,
		onretry,
		flush = false,
		skeleton,
		class: className,
		contentClass,
		children
	}: {
		title: string;
		description?: string;
		/** Sits at the top right of the header: a toggle, a hint. */
		action?: Snippet;
		/** Anything but `ready` replaces the content, so every widget waits and fails the same way. */
		state?: 'ready' | 'loading' | 'empty' | 'error' | 'message';
		/** The text for `state="message"`. */
		message?: string;
		onretry?: () => void;
		/** The content runs edge to edge: for a band of cells or a table. */
		flush?: boolean;
		/** What to draw while loading, in the shape of the content. Defaults to a few lines. */
		skeleton?: Snippet;
		class?: string;
		contentClass?: string;
		children?: Snippet;
	} = $props();
</script>

<Card class={cn('h-full border ring-0', flush && 'pb-0', className)}>
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
		{#if skeleton}
			<div class={cn('flex-1', !flush && 'px-(--card-spacing)')}>{@render skeleton()}</div>
		{:else}
			<CardContent
				class={cn('flex min-h-32 flex-1 flex-col gap-3', flush && 'pb-(--card-spacing)')}
			>
				<Skeleton class="h-7 w-28" />
				<Skeleton class="h-3 w-full" />
				<Skeleton class="h-3 w-4/5" />
				<Skeleton class="h-3 w-3/5" />
			</CardContent>
		{/if}
	{:else if state === 'empty'}
		<!-- From shadcn.io empty-state-no-metrics: a dashed tile and one sentence. -->
		<CardContent class={cn('flex flex-1', flush && 'pb-(--card-spacing)')}>
			<div
				class="flex min-h-28 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground"
			>
				<ChartBar class="size-6 opacity-60" />
				<p class="text-sm">{m.no_data_display()}</p>
			</div>
		</CardContent>
	{:else if state === 'error'}
		<!-- From shadcn.io error-compact: the widget fails on its own, with a way to try again. -->
		<CardContent class={cn('flex flex-1', flush && 'pb-(--card-spacing)')}>
			<div
				role="alert"
				class="flex min-h-28 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 text-center"
			>
				<p class="flex items-center gap-1.5 text-sm text-destructive">
					<CircleAlert class="size-4 shrink-0" />
					{m.widget_load_failed()}
				</p>
				{#if onretry}
					<Button variant="outline" size="sm" onclick={onretry}>{m.retry()}</Button>
				{/if}
			</div>
		</CardContent>
	{:else if state === 'message'}
		<CardContent class={cn('text-sm text-muted-foreground', flush && 'pb-(--card-spacing)')}>
			{message}
		</CardContent>
	{:else if flush}
		<div class={cn('flex-1', contentClass)}>
			{@render children?.()}
		</div>
	{:else}
		<CardContent class={cn('flex-1', contentClass)}>
			{@render children?.()}
		</CardContent>
	{/if}
</Card>
