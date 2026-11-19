<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { buttonVariants } from '$lib/components/shadcnio/button';
	import { cn } from '$lib/utils';

	import type { SidebarMenuActionProps } from './shared';
	let {
		class: className,
		showOnHover = false,
		ref = $bindable(null),
		...rest
	}: SidebarMenuActionProps = $props();
</script>

<Ark
	as="button"
	class={cn(
		buttonVariants({
			clickEffect: false,
			size: 'icon-xs',
			variant: 'ghost'
		}),
		'absolute inset-e-1 top-1.5 aspect-square w-5 rounded-md p-0 text-sidebar-foreground ring-sidebar-ring peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4',
		'text-sidebar-foreground',
		'transition-none!',
		'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
		'peer-hover/menu-button:text-sidebar-accent-foreground',
		'after:absolute after:-inset-2 md:after:hidden',
		'peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=md]/menu-button:top-1.5 peer-data-[size=sm]/menu-button:top-1',
		'in-data-[collapsible=icon]:hidden',
		'[&_svg]:size-4 [&_svg]:shrink-0',
		showOnHover &&
			'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
		className
	)}
	data-sidebar="menu-action"
	data-slot="sidebar-menu-action"
	type="button"
	{...rest}
	bind:ref
/>
