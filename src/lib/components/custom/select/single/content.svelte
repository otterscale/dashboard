<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: import('svelte').Snippet; [key: string]: unknown } = $props();
</script>

<Popover.Content class={cn('w-[220px] p-0', className)} {...restProps}>
	{@render children?.()}
</Popover.Content>
