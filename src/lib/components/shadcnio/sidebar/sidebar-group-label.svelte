<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';
	import { getContext } from 'svelte';

	import {
		CollapsibleIndicator,
		CollapsibleTrigger
	} from '$lib/components/shadcnio/collapsible/index.js';
	import { cn } from '$lib/utils';

	import {
		SidebarGroupCollapsibleContext_DEFAULT,
		SidebarGroupCollapsibleContext_KEY
	} from './context-keys';
	let {
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
	const collapsible =
		getContext<typeof SidebarGroupCollapsibleContext_DEFAULT>(SidebarGroupCollapsibleContext_KEY) ??
		SidebarGroupCollapsibleContext_DEFAULT;
	const classes = $derived(
		cn(
			'text-sidebar-foreground/70 ring-sidebar-ring rounded-md px-2 text-xs font-medium transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 flex h-8 w-full shrink-0 items-center gap-2',
			'rounded-md border-0 bg-transparent px-2 shadow-none',
			'font-medium text-sidebar-foreground/70 text-xs',
			'outline-hidden ring-sidebar-ring focus-visible:ring-2',
			'[&_svg]:size-4 [&_svg]:shrink-0',
			'transition-[margin,opacity] duration-200 ease-linear',
			'motion-reduce:transition-none!',
			'in-data-[collapsible=icon]:pointer-events-none in-data-[collapsible=icon]:-mt-8 in-data-[collapsible=icon]:opacity-0',
			// Collapsed, its text would size the rail's scroll area past the icon width.
			'in-data-[collapsible=icon]:w-0 in-data-[collapsible=icon]:overflow-hidden',
			className
		)
	);
</script>

{#if !collapsible}<Ark
		as="div"
		class={classes}
		data-sidebar="group-label"
		data-slot="sidebar-group-label"
		{...rest}
		bind:ref>{@render children?.()}</Ark
	>{:else}<CollapsibleTrigger
		class={cn(
			classes,
			'cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
		)}
		data-sidebar="group-label"
		data-slot="sidebar-group-label"
		><Ark as="span" class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-start"
			>{@render children?.()}</Ark
		><CollapsibleIndicator
			class="ms-auto text-sidebar-foreground/50 [&_svg]:size-3.5 [&_svg]:transition-none!"
		/></CollapsibleTrigger
	>{/if}
