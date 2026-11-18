<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
</script>

<Ark
	as="div"
	class={cn(
		'pointer-events-none absolute inset-e-1 flex h-5 min-w-5 rounded-md px-1 text-xs font-medium text-sidebar-foreground peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground',
		'flex items-center justify-center',
		'px-1',
		'h-5 min-w-5',
		'rounded-md',
		'text-xs font-medium text-sidebar-foreground tabular-nums select-none',
		'pointer-events-none',
		'peer-hover/menu-button:text-sidebar-accent-foreground',
		'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
		'peer-data-[size=lg]/menu-button:top-2.5',
		'peer-data-[size=md]/menu-button:top-1.5',
		'peer-data-[size=sm]/menu-button:top-1',
		'in-data-[collapsible=icon]:hidden',
		className
	)}
	data-sidebar="menu-badge"
	data-slot="sidebar-menu-badge"
	{...rest}
	bind:ref
/>
