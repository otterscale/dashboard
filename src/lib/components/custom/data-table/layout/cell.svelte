<script lang="ts">
	import type { HTMLTableCellElement } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: import('svelte').Snippet; [key: string]: unknown } = $props();
</script>

<div class={cn('flex flex-col gap-0.5', className)} {...restProps}>
	{@render children?.()}
</div>
