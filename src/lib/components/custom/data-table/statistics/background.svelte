<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';

	let {
		icon: IconComponent,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { icon?: Component } = $props();
</script>

<div
	data-slot="data-table-statistics-background"
	class={cn('pointer-events-none absolute right-2 bottom-2 text-muted-foreground/10', className)}
	{...restProps}
>
	{#if IconComponent}
		<IconComponent class="size-24" />
	{/if}
</div>
