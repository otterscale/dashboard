<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Component, Snippet } from 'svelte';

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

	import InfoTip from './info-tip.svelte';
	import type { LoadStatus } from './loadable.svelte';
	import { cardClass } from './status';
	import WidgetState from './widget-state.svelte';

	// The shell of every dashboard widget. The title is there from the first paint;
	// the body is a skeleton, the content, an empty state or an error state, all in
	// a box of the same minimum height so the page does not jump between them.
	let {
		title,
		description,
		info,
		status = 'ready',
		stale = false,
		bodyClass,
		class: className,
		emptyTitle,
		emptyDescription,
		emptyIcon,
		action,
		skeleton,
		children
	}: {
		title: string;
		description?: string;
		/** Longer explanation, behind an info button. */
		info?: string;
		status?: LoadStatus;
		/** The last refresh failed; what is shown is older. */
		stale?: boolean;
		/** Sizing of the body, e.g. `min-h-40`. Applies to every state. */
		bodyClass?: string;
		class?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyIcon?: Component;
		action?: Snippet;
		/** Placeholder shaped like the content. A plain block when not given. */
		skeleton?: Snippet;
		children: Snippet;
	} = $props();
</script>

<Card class={cn(cardClass, className)} data-status={status}>
	<CardHeader>
		<CardTitle class="flex min-w-0 items-center gap-1.5 text-base font-medium">
			<span class="min-w-0 text-balance">{title}</span>
			{#if info}<InfoTip text={info} />{/if}
			{#if stale}
				<InfoTip
					text={m.dash_state_stale()}
					icon={TriangleAlertIcon}
					class="text-warning-foreground hover:text-warning-foreground"
				/>
			{/if}
		</CardTitle>
		{#if description}
			<CardDescription class="text-pretty">{description}</CardDescription>
		{/if}
		{#if action}
			<CardAction>{@render action()}</CardAction>
		{/if}
	</CardHeader>
	<CardContent class={cn('flex min-w-0 flex-1 flex-col', bodyClass)}>
		{#if status === 'loading'}
			{#if skeleton}
				{@render skeleton()}
			{:else}
				<Skeleton class="min-h-16 w-full flex-1" />
			{/if}
		{:else if status === 'error'}
			<WidgetState kind="error" class="flex-1" />
		{:else if status === 'empty'}
			<WidgetState
				kind="empty"
				title={emptyTitle}
				description={emptyDescription}
				icon={emptyIcon}
				class="flex-1"
			/>
		{:else}
			{@render children()}
		{/if}
	</CardContent>
</Card>
