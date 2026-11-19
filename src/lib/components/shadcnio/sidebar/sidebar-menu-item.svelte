<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'li'>>, 'as'> = $props();
</script>

<Ark
	as="li"
	class={cn('group/menu-item relative', className)}
	data-sidebar="menu-item"
	data-slot="sidebar-menu-item"
	{...rest}
	bind:ref
/>
