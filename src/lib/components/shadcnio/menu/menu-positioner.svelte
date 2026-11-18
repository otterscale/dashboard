<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkMenu.Positioner> = $props();
</script>

<ArkMenu.Positioner
	class={cn('outline-none', className)}
	data-slot="menu-positioner"
	{...rest}
	bind:ref
/>
