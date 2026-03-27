<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: import('svelte').Snippet; [key: string]: unknown } = $props();
</script>

<div class={cn('flex items-center', className)} {...restProps}>
	{@render children?.()}
</div>
