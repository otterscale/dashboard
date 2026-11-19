<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import { Separator } from '$lib/components/shadcnio/separator';
	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof Separator> = $props();
</script>

<Separator
	class={cn('mx-2 w-auto bg-sidebar-border', className)}
	data-sidebar="separator"
	data-slot="sidebar-separator"
	{...rest}
	bind:ref
/>
