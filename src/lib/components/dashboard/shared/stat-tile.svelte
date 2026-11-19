<script lang="ts">
	import type { Snippet } from 'svelte';

	import { Button } from '$lib/components/shadcnio/button';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Status } from '$lib/components/shadcnio/status';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { type Tone, toneFill, toneText } from './tone';

	let {
		label,
		value,
		unit,
		hint,
		tone = 'default',
		dot = false,
		state = 'ready',
		onretry,
		long = false,
		class: className,
		children
	}: {
		label: string;
		/** The headline figure. */
		value?: string | number | null;
		unit?: string;
		/** One line under the label. */
		hint?: string;
		/** Colors the figure. A count that is fine stays `default` or `muted`. */
		tone?: Tone;
		/** Puts a status dot in front of the hint, in the tile's tone. */
		dot?: boolean;
		/**
		 * `loading` swaps only the figure for a bar of the same size, so the label is there from
		 * the start and nothing moves when the figure arrives.
		 */
		state?: 'ready' | 'loading' | 'empty' | 'error';
		onretry?: () => void;
		/** For a figure that is a long string, like a version: smaller, and it wraps instead of being cut. */
		long?: boolean;
		class?: string;
		/** Extra content under the hint. */
		children?: Snippet;
	} = $props();
</script>

<!--
	One cell of a KPI band (shadcn.io stats-connected-kpi-bar): figure first, its label under it,
	then a line of context. Cells share hairlines through the band's `gap-px`, so a cell has a
	background and padding but no border of its own.
-->
<div class={cn('flex h-full min-w-0 flex-col bg-card px-4 py-4 sm:px-5', className)}>
	<div class="flex min-h-9 items-center">
		{#if state === 'loading'}
			<Skeleton class="h-7 w-20" />
		{:else if state === 'empty' || state === 'error' || value === null || value === undefined}
			<span class="text-2xl font-semibold text-muted-foreground" aria-hidden="true">—</span>
		{:else}
			<p
				class={cn(
					'font-semibold tracking-tight tabular-nums',
					long ? 'text-lg leading-6 break-all' : 'truncate text-2xl',
					toneText[tone === 'primary' ? 'default' : tone]
				)}
				title={String(value)}
			>
				<bdi>{value}</bdi>
				{#if unit}
					<span class="ms-0.5 text-sm font-normal tracking-normal text-muted-foreground"
						>{unit}</span
					>
				{/if}
			</p>
		{/if}
	</div>
	<p class="mt-1 truncate text-sm text-muted-foreground">{label}</p>
	<!-- A tile without a hint has no third line, loading or not, so the band keeps its height. -->
	<div
		class={cn(
			'mt-2 flex items-center gap-1.5 text-xs text-muted-foreground',
			(hint || state === 'error' || state === 'empty') && 'min-h-5'
		)}
	>
		{#if state === 'loading' && hint}
			<Skeleton class="h-3 w-24" />
		{:else if state === 'loading'}
			<!-- nothing -->
		{:else if state === 'error'}
			<span class="truncate text-destructive">{m.widget_load_failed()}</span>
			{#if onretry}
				<Button variant="outline" size="xs" class="ms-auto shrink-0" onclick={onretry}>
					{m.retry()}
				</Button>
			{/if}
		{:else if state === 'empty'}
			<span class="truncate">{m.no_data_display()}</span>
		{:else if hint}
			{#if dot}
				<Status size="sm" class={cn('ring-0', toneFill[tone])} />
			{/if}
			<span class="truncate" title={hint}>{hint}</span>
		{/if}
	</div>
	{#if state === 'ready'}
		{@render children?.()}
	{/if}
</div>
