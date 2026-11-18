<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkMenu.ItemGroupLabel> = $props();
</script>

<ArkMenu.ItemGroupLabel
	class={cn('px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:ps-7', className)}
	data-slot="menu-group-label"
	{...rest}
	bind:ref
/>
