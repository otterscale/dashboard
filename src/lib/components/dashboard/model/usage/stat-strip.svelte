<script lang="ts">
	import { NUM, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// Numbers for the window in one strip, 1px rules between them. Five with a line under each
	// for the whole selection; six without, smaller, for the selected row.
	let {
		items,
		state,
		label,
		compact = false
	}: {
		items: { label: string; value: string; note?: string; noteClass?: string }[];
		state: WidgetState;
		label: string;
		compact?: boolean;
	} = $props();
</script>

<section
	class={cn(
		'grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border shadow-(--card-frame)',
		compact ? '@2xl:grid-cols-3 @5xl:grid-cols-6' : '@2xl:grid-cols-3 @5xl:grid-cols-5'
	)}
	aria-label={label}
>
	{#each items as item, i (i)}
		<div
			class={cn(
				'min-w-0 bg-card px-4 @md:px-5',
				compact ? 'py-3' : 'py-3.5',
				!compact && i === items.length - 1 && items.length % 2 === 1 && 'col-span-2 @2xl:col-span-1'
			)}
		>
			<p class="truncate text-xs leading-4 text-muted-foreground">{item.label}</p>
			{#if state === 'loading'}
				<Skeleton class={cn('mt-1.5 w-16', compact ? 'h-6' : 'h-7')} />
				{#if !compact}<Skeleton class="mt-1.5 h-3 w-20" />{/if}
			{:else if state === 'error'}
				<p
					class={cn(
						'mt-1 text-muted-foreground',
						compact ? 'text-2xl leading-7' : 'text-[1.75rem] leading-8'
					)}
					aria-hidden="true"
				>
					—
				</p>
				{#if !compact}
					<p class="text-xs leading-4 text-muted-foreground">{m.dashboard_couldnt_load()}</p>
				{/if}
			{:else}
				<p
					class={cn(
						'mt-1 truncate tracking-tight',
						compact ? 'text-2xl leading-7' : 'text-[1.75rem] leading-8',
						NUM
					)}
				>
					{item.value}
				</p>
				{#if !compact}
					<p
						class={cn('truncate text-xs leading-4', item.noteClass ?? 'text-muted-foreground')}
						title={item.note}
					>
						{item.note ?? ''}
					</p>
				{/if}
			{/if}
		</div>
	{/each}
</section>
