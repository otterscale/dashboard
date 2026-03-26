<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: import('svelte').Snippet; [key: string]: unknown } = $props();
</script>

<span class={cn('text-xs font-normal text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</span>
