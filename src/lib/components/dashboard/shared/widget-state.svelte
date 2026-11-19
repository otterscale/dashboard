<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import type { Component } from 'svelte';

	import {
		Empty,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '$lib/components/shadcnio/empty';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// The one empty and the one error look of the dashboards. Same shape, different
	// icon and words, so "nothing to show" and "could not ask" are never confused.
	let {
		kind,
		title,
		description,
		icon,
		compact = false,
		class: className
	}: {
		kind: 'empty' | 'error';
		title?: string;
		description?: string;
		icon?: Component;
		/** One line, for small tiles: icon and title only. */
		compact?: boolean;
		class?: string;
	} = $props();

	const Icon = $derived(icon ?? (kind === 'error' ? CircleAlertIcon : InboxIcon));
	const heading = $derived(
		title ?? (kind === 'error' ? m.dash_state_error_title() : m.no_data_display())
	);
	const detail = $derived(
		description ??
			(kind === 'error' ? m.dash_state_error_description() : m.dash_state_empty_description())
	);
</script>

{#if compact}
	<div
		class={cn(
			'flex min-w-0 items-center gap-2 text-sm font-normal text-muted-foreground',
			className
		)}
		data-state-kind={kind}
		role={kind === 'error' ? 'alert' : undefined}
		title={detail}
	>
		<Icon class={cn('size-4 shrink-0', kind === 'error' && 'text-destructive')} />
		<span class="truncate">{heading}</span>
	</div>
{:else}
	<Empty
		class={cn('gap-2 border-0 p-4', className)}
		data-state-kind={kind}
		role={kind === 'error' ? 'alert' : undefined}
	>
		<EmptyHeader class="gap-1">
			<EmptyMedia variant="icon" class={cn('mb-1', kind === 'error' && 'text-destructive')}>
				<Icon />
			</EmptyMedia>
			<EmptyTitle>{heading}</EmptyTitle>
			<EmptyDescription class="text-xs">{detail}</EmptyDescription>
		</EmptyHeader>
	</Empty>
{/if}
