<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';
	import { getContext } from 'svelte';

	import { CollapsibleContent } from '$lib/components/shadcnio/collapsible';
	import { cn } from '$lib/utils';

	import {
		SidebarGroupCollapsibleContext_DEFAULT,
		SidebarGroupCollapsibleContext_KEY
	} from './context-keys';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
	const collapsible =
		getContext<typeof SidebarGroupCollapsibleContext_DEFAULT>(SidebarGroupCollapsibleContext_KEY) ??
		SidebarGroupCollapsibleContext_DEFAULT;
</script>

{#snippet content()}<Ark
		as="div"
		class={cn('w-full text-sm', className)}
		data-sidebar="group-content"
		data-slot="sidebar-group-content"
		{...rest}
		bind:ref
	/>{/snippet}
{#if !collapsible}{@render content()}{:else}<CollapsibleContent disableAnimation
		>{@render content()}</CollapsibleContent
	>{/if}
