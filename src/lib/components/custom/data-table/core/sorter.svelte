<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
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
		<ArrowUp class="size-3" />
	{:else if sorted === 'desc'}
		<ArrowDown class="size-3" />
	{:else}
		<ArrowUpDown class="size-3 opacity-40" />
	{/if}
</button>
