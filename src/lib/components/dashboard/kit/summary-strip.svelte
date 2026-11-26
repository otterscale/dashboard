<script lang="ts">
	import { NUM, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	// History: five numbers for the window in one strip, 1px rules between them.
	let {
		items,
		state
	}: {
		/** `valueClass` colours one number, e.g. a warning for a count that should be zero. */
		items: { label: string; value: string; note: string; valueClass?: string }[];
		state: WidgetState;
	} = $props();
</script>

<section
	class="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border shadow-(--card-frame) @2xl:grid-cols-3 @5xl:grid-cols-5"
	aria-label={m.analytics_summary()}
>
	{#each items as item, i (i)}
		<div
			class="min-w-0 bg-card px-4 py-3.5 @md:px-5 {i === items.length - 1
				? 'col-span-2 @5xl:col-span-1'
				: ''}"
		>
			<p class="truncate text-xs leading-4 text-muted-foreground">{item.label}</p>
			{#if state === 'loading'}
				<Skeleton class="mt-1.5 h-7 w-16" />
				<Skeleton class="mt-1.5 h-3 w-20" />
			{:else if state === 'error'}
				<p class="mt-1 text-[1.75rem] leading-8 text-muted-foreground" aria-hidden="true">—</p>
				<p class="text-xs leading-4 text-muted-foreground">{m.dashboard_couldnt_load()}</p>
			{:else}
				<p
					class="mt-1 truncate text-[1.75rem] leading-8 tracking-tight {NUM} {item.valueClass ??
						''}"
				>
					{item.value}
				</p>
				<p class="truncate text-xs leading-4 text-muted-foreground" title={item.note}>
					{item.note}
				</p>
			{/if}
		</div>
	{/each}
</section>
