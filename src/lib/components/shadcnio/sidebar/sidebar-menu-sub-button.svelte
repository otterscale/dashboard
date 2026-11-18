<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { SidebarMenuSubButtonProps } from './shared';
	let {
		size = 'md',
		isActive = false,
		class: className,
		ref = $bindable(null),
		...rest
	}: SidebarMenuSubButtonProps = $props();
</script>

<Ark
	as="a"
	class={cn(
		'flex h-7 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:text-sidebar-accent-foreground',
		'text-left text-sm font-normal text-sidebar-foreground',
		'ring-sidebar-ring outline-none',
		'ltr:-translate-x-px rtl:translate-x-px',
		'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
		'active:bg-sidebar-accent active:text-sidebar-accent-foreground',
		'focus-visible:ring-2',
		'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
		'[&>span:last-child]:truncate',
		'[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55',
		size === 'sm' && 'h-7 text-xs',
		className
	)}
	data-active={isActive}
	data-sidebar="menu-sub-button"
	data-size={size}
	data-slot="sidebar-menu-sub-button"
	{...rest}
	bind:ref
/>
