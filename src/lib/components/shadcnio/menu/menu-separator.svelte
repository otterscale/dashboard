<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkMenu.Separator> = $props();
</script>

<ArkMenu.Separator
	class={cn('-mx-1 my-1 h-px bg-border', className)}
	data-slot="menu-separator"
	{...rest}
	bind:ref
/>
