<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	import { Card } from '$lib/components/shadcnio/card';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { cn } from '$lib/utils';

	import { type Tone, toneChip, toneText } from './tone';

	let {
		label,
		value,
		unit,
		hint,
		tone = 'default',
		icon: Icon,
		loading = false,
		class: className,
		children
	}: {
		label: string;
		/** The headline figure. Leave out and pass `children` for anything richer. */
		value?: string | number | null;
		unit?: string;
		/** One line under the figure. */
		hint?: string;
		/** Colors the figure and the icon chip. */
		tone?: Tone;
		icon?: Component<{ class?: string }>;
		loading?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<Card size="sm" class={cn('h-full gap-2 px-4', className)}>
	<div class="flex items-center justify-between gap-2">
		<span class="truncate text-sm text-muted-foreground">{label}</span>
		{#if Icon}
			<span
				class={cn('flex size-7 shrink-0 items-center justify-center rounded-md', toneChip[tone])}
				aria-hidden="true"
			>
				<Icon class="size-4" />
			</span>
		{/if}
	</div>
	{#if loading}
		<Skeleton class="h-8 w-24" />
		<Skeleton class="h-3.5 w-32" />
	{:else}
		{#if value !== undefined}
			<p
				class={cn(
					'text-2xl leading-8 font-semibold tracking-tight tabular-nums',
					toneText[tone === 'primary' ? 'default' : tone]
				)}
			>
				{value ?? '—'}
				{#if unit && value !== null}
					<span class="text-base font-medium text-muted-foreground">{unit}</span>
				{/if}
			</p>
		{/if}
		{@render children?.()}
		{#if hint}
			<p class="truncate text-xs text-muted-foreground" title={hint}>{hint}</p>
		{/if}
	{/if}
</Card>
