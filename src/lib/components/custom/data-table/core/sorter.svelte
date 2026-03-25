<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { Column } from '@tanstack/table-core';
	import { cn } from '$lib/utils';

	let {
		column,
		class: className,
		children
	}: {
		column: Column<unknown>;
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();

	const sorted = $derived(column.getIsSorted());
</script>

<button
	type="button"
	class={cn('flex items-center gap-1 text-xs font-medium hover:text-foreground', className)}
	onclick={() => column.toggleSorting(sorted === 'asc')}
>
	{@render children?.()}
	{#if sorted === 'asc'}
		<Icon icon="ph:arrow-up" class="size-3" />
	{:else if sorted === 'desc'}
		<Icon icon="ph:arrow-down" class="size-3" />
	{:else}
		<Icon icon="ph:arrows-down-up" class="size-3 opacity-40" />
	{/if}
</button>
