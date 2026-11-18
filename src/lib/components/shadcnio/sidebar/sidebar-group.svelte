<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { Collapsible } from '$lib/components/shadcnio/collapsible/index.js';
	import { cn } from '$lib/utils';

	import type { SidebarGroupProps } from './shared';
	import SidebarGroupCollapsibleContext from './sidebar-group-collapsible-context.svelte';
	let {
		class: className,
		collapsible = false,
		defaultOpen = true,
		open,
		onOpenChange,
		children,
		ref = $bindable(null),
		...rest
	}: SidebarGroupProps = $props();
</script>

{#snippet group()}<Ark
		as="div"
		class={cn('relative flex w-full min-w-0 flex-col p-2', className)}
		data-sidebar="group"
		data-slot="sidebar-group"
		{...rest}
		bind:ref
		><SidebarGroupCollapsibleContext value={collapsible}
			>{@render children?.()}</SidebarGroupCollapsibleContext
		></Ark
	>{/snippet}
{#if !collapsible}{@render group()}{:else}<Collapsible
		lazyMount={false}
		{onOpenChange}
		unmountOnExit={false}
		{...open === undefined ? { defaultOpen } : { open }}>{@render group()}</Collapsible
	>{/if}
