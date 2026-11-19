<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'ul'>>, 'as'> = $props();
</script>

<Ark
	as="ul"
	class={cn(
		'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden ltr:translate-x-px rtl:-translate-x-px',
		'border-s border-sidebar-border',
		'in-data-[collapsible=icon]:hidden',
		className
	)}
	data-sidebar="menu-sub"
	data-slot="sidebar-menu-sub"
	{...rest}
	bind:ref
/>
