<script lang="ts">
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	let {
		class: className,
		inset = false,
		children
	}: {
		/** The grid columns: `grid-cols-2 lg:grid-cols-4`. */
		class?: string;
		/** Inside a card: no outer border or rounding, only the rule above. */
		inset?: boolean;
		children: Snippet;
	} = $props();
</script>

<!--
	Cells that share their hairlines (the pattern of shadcn.io's stats blocks): the grid's
	1px gaps show the border color behind it. Every direct child needs its own background.
-->
<div class={cn('overflow-hidden bg-border', inset ? 'h-full border-t' : 'rounded-xl border')}>
	<div class={cn('grid gap-px', inset && 'h-full', className)}>
		{@render children()}
	</div>
</div>
