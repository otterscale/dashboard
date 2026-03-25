<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className = undefined,
		children
	}: { class?: string; children?: import('svelte').Snippet } = $props();
</script>

<div class={cn('flex flex-col', className)}>
	{@render children?.()}
</div>
