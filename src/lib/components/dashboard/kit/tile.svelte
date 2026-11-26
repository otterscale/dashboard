<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { Snippet } from 'svelte';

	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { NUM, type WidgetState } from './index';

	// One key number: a small label, the number, and a line of context. Fixed height, so the
	// loading and empty states take exactly the room the number will.
	let {
		label,
		state = 'ready',
		tone = 'default',
		size = 'default',
		tooltip,
		class: className,
		children,
		note,
		body
	}: {
		label: string;
		state?: WidgetState;
		/**
		 * `ink` (the `attention` colour) means something needs a look; `mint` means the thing it watches is fine.
		 * Both are driven by data, never fixed, so the colour itself is the signal.
		 */
		tone?: 'default' | 'ink' | 'mint';
		/** `sm` is for supporting facts that should not compete with the main cards. */
		size?: 'default' | 'sm';
		class?: string;
		tooltip?: string;
		/** The number. */
		children?: Snippet;
		note?: Snippet;
		/** Replaces the number and note, for a tile that holds a short list instead. */
		body?: Snippet;
	} = $props();

	const ink = $derived(tone === 'ink');
	const sm = $derived(size === 'sm');
	const muted = $derived(
		tone === 'ink'
			? 'text-attention-muted'
			: tone === 'mint'
				? 'text-mint-foreground/70'
				: 'text-muted-foreground'
	);
</script>

<Card.Root
	class={cn(
		'h-full justify-between rounded-2xl shadow-(--card-frame) ring-0',
		sm ? 'min-h-[6.125rem] gap-1.5 p-3.5' : 'min-h-[7.25rem] gap-2 p-4 @md:px-5',
		ink && 'bg-attention text-attention-foreground shadow-none dark:shadow-(--card-frame)',
		tone === 'mint' && 'bg-mint text-mint-foreground shadow-none',
		className
	)}
>
	<div class="flex items-center justify-between gap-2">
		<p class={cn('truncate text-xs leading-4 font-[450]', muted)}>
			{label}
		</p>
		{#if tooltip}
			<Tooltip.Root>
				<Tooltip.Trigger
					class="-my-1 shrink-0 rounded-sm text-current opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="{m.information()}: {label}"
				>
					<InfoIcon class="size-3.5" />
				</Tooltip.Trigger>
				<Tooltip.Content class="max-w-xs">
					<p>{tooltip}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
	<div class="min-w-0">
		{#if state === 'loading'}
			<Skeleton class={cn(sm ? 'h-6 w-14' : 'h-7 w-16', ink && 'bg-attention-foreground/10')} />
			<Skeleton class={cn('mt-2 h-3 w-24', ink && 'bg-attention-foreground/10')} />
		{:else if state === 'empty' || state === 'error'}
			<p
				class={cn(sm ? 'text-xl leading-7' : 'text-[1.75rem] leading-8', muted)}
				aria-hidden="true"
			>
				—
			</p>
			<p class={cn('mt-1 text-xs leading-4', muted)}>
				{state === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
			</p>
		{:else if body}
			{@render body()}
		{:else}
			<div
				class={cn(
					'truncate tracking-tight',
					NUM,
					sm
						? 'text-xl leading-7'
						: tone !== 'default'
							? 'text-4xl leading-10 font-[350]'
							: 'text-[1.75rem] leading-8'
				)}
			>
				{@render children?.()}
			</div>
			<div class={cn('mt-1 min-h-4 truncate text-xs leading-4', muted)}>
				{@render note?.()}
			</div>
		{/if}
	</div>
</Card.Root>
