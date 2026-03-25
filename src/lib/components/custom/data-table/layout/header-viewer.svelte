<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: import('svelte').Snippet; [key: string]: unknown } = $props();
</script>

<div class={cn('flex flex-col text-xs font-semibold', className)} {...restProps}>
	{@render children?.()}
</div>
