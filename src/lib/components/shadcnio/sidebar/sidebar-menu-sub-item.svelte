<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...props
	}: Omit<ComponentProps<typeof Ark<'li'>>, 'as'> = $props();
</script>

<Ark
	as="li"
	class={cn('group/menu-sub-item relative', className)}
	data-sidebar="menu-sub-item"
	data-slot="sidebar-menu-sub-item"
	{...props}
	bind:ref
/>
