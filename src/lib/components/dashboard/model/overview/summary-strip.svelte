<script lang="ts" module>
	import type { Tone } from './lib/models';

	export type SummaryItem = { label: string; value: string; note?: string; tone?: Tone };
</script>

<script lang="ts">
	import { NUM, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// Five numbers in one strip with 1px rules between them. A tone colours the number only when
	// it asks for a look; the line under it says why.
	let { items, state, label }: { items: SummaryItem[]; state: WidgetState; label: string } =
		$props();

	const toneClass: Record<Tone, string> = {
		ok: 'text-chart-2',
		warn: 'text-chart-1',
		bad: 'text-destructive',
		muted: 'text-muted-foreground'
	};
</script>

<section
	class="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border shadow-(--card-frame) @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5"
	aria-label={label}
>
	{#each items as item, i (i)}
		<div
			class={cn(
				'min-w-0 bg-card px-4 py-3.5 @md:px-5',
				i === items.length - 1 && '@md:col-span-2 @3xl:col-span-1',
				i === items.length - 2 && '@3xl:col-span-2 @5xl:col-span-1'
			)}
		>
			<p class="truncate text-xs leading-4 text-muted-foreground">{item.label}</p>
			{#if state === 'loading'}
				<Skeleton class="mt-1.5 h-7 w-16" />
				<Skeleton class="mt-1.5 h-3 w-24" />
			{:else if state === 'error'}
				<p class="mt-1 text-[1.75rem] leading-8 text-muted-foreground" aria-hidden="true">—</p>
				<p class="truncate text-xs leading-4 text-muted-foreground">
					{m.dashboard_couldnt_load()}
				</p>
			{:else}
				<p
					class={cn(
						'mt-1 truncate text-[1.75rem] leading-8 font-[350] tracking-tight',
						NUM,
						item.tone && toneClass[item.tone]
					)}
				>
					{item.value}
				</p>
				<p class="truncate text-xs leading-4 text-muted-foreground">
					{item.note ?? ''}
				</p>
			{/if}
		</div>
	{/each}
</section>
