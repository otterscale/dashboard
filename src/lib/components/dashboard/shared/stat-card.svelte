<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Component, Snippet } from 'svelte';

	import { Card } from '$lib/components/shadcnio/card';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import InfoTip from './info-tip.svelte';
	import type { LoadStatus } from './loadable.svelte';
	import { cardClass } from './status';
	import WidgetState from './widget-state.svelte';

	// The stat tile of the Solaris dashboard picture: an icon block, a small label
	// and one big value. The value line has a fixed height, so loading, empty and
	// error do not move it.
	let {
		label,
		icon: Icon,
		info,
		status = 'ready',
		stale = false,
		class: className,
		valueClass,
		children,
		detail
	}: {
		label: string;
		icon?: Component;
		info?: string;
		status?: LoadStatus;
		stale?: boolean;
		class?: string;
		valueClass?: string;
		/** The value. */
		children: Snippet;
		/** A line under the value. */
		detail?: Snippet;
	} = $props();
</script>

<Card class={cn(cardClass, className)} data-status={status}>
	<div class="flex min-w-0 items-start gap-4 px-(--card-spacing)">
		{#if Icon}
			<div
				class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
				aria-hidden="true"
			>
				<Icon class="size-5" />
			</div>
		{/if}
		<div class="grid min-w-0 flex-1 gap-1">
			<div class="flex min-h-6 min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
				<span class="truncate">{label}</span>
				{#if info}<InfoTip text={info} />{/if}
				{#if stale}
					<InfoTip
						text={m.dash_state_stale()}
						icon={TriangleAlertIcon}
						class="text-warning-foreground hover:text-warning-foreground"
					/>
				{/if}
			</div>
			<div
				class={cn(
					'flex min-h-8 min-w-0 items-center text-2xl leading-8 font-medium tabular-nums',
					valueClass
				)}
			>
				{#if status === 'loading'}
					<Skeleton class="h-6 w-24" />
				{:else if status === 'error'}
					<WidgetState kind="error" compact />
				{:else if status === 'empty'}
					<WidgetState kind="empty" compact />
				{:else}
					{@render children()}
				{/if}
			</div>
			{#if detail}
				<div class="min-h-5 min-w-0 text-xs text-muted-foreground">
					{#if status === 'loading'}
						<Skeleton class="h-3 w-32" />
					{:else if status === 'ready'}
						{@render detail()}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</Card>
