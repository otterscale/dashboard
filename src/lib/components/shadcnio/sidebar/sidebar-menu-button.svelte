<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import { getContext } from 'svelte';

	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { cn } from '$lib/utils';

	import {
		SidebarContext_DEFAULT,
		SidebarContext_KEY,
		SidebarPlacementContext_DEFAULT,
		SidebarPlacementContext_KEY
	} from './context-keys';
	import { type SidebarMenuButtonProps, sidebarMenuButtonVariants } from './shared';
	let { tooltip, ref = $bindable(null), ...props }: SidebarMenuButtonProps = $props();
	const {
		isActive = false,
		size = 'md',
		variant = 'default',
		class: className,
		...rest
	} = $derived(props);
	const sidebar =
		getContext<typeof SidebarContext_DEFAULT>(SidebarContext_KEY) ?? SidebarContext_DEFAULT;
	const placement =
		getContext<typeof SidebarPlacementContext_DEFAULT>(SidebarPlacementContext_KEY) ??
		SidebarPlacementContext_DEFAULT;
	const away = $derived(
		(placement === 'left') === ((sidebar?.dir ?? 'ltr') === 'ltr') ? 'right' : 'left'
	);
	const isMobile = $derived(sidebar?.isMobile ?? false);
	const stateValue = $derived(sidebar?.state ?? 'expanded');
	const menuSize = $derived(size === 'default' ? 'md' : size);
</script>

{#snippet button()}<Ark
		as="button"
		class={cn(
			sidebarMenuButtonVariants({ size: menuSize, variant }),
			'in-data-[collapsible=icon]:size-8! in-data-[collapsible=icon]:overflow-hidden in-data-[collapsible=icon]:p-2!',
			// Collapsed to its icon, the label stays in the name (sr-only, not hidden).
			'in-data-[collapsible=icon]:[&>:not(:first-child)]:sr-only',
			menuSize === 'lg' && 'in-data-[collapsible=icon]:p-0!',
			className
		)}
		data-active={isActive}
		data-sidebar="menu-button"
		data-size={menuSize}
		data-slot="sidebar-menu-button"
		{...rest}
		bind:ref
	/>{/snippet}
{#if !tooltip}{@render button()}{:else}<Tooltip
		closeDelay={0}
		ids={rest.id ? { trigger: rest.id } : undefined}
		openDelay={0}
		positioning={{ placement: away }}
		><TooltipTrigger
			>{#snippet asChild(props)}<Ark
					as="button"
					{...props({
						class: cn(
							sidebarMenuButtonVariants({ size: menuSize, variant }),
							'in-data-[collapsible=icon]:size-8! in-data-[collapsible=icon]:overflow-hidden in-data-[collapsible=icon]:p-2!',
							// Collapsed to its icon, the label stays in the name (sr-only, not hidden).
							'in-data-[collapsible=icon]:[&>:not(:first-child)]:sr-only',
							menuSize === 'lg' && 'in-data-[collapsible=icon]:p-0!',
							className
						),
						'data-active': isActive,
						'data-sidebar': 'menu-button',
						'data-size': menuSize,
						'data-slot': 'sidebar-menu-button',
						...rest
					})}
					bind:ref
				/>{/snippet}</TooltipTrigger
		>{#if typeof tooltip === 'string'}<TooltipContent
				hidden={stateValue !== 'collapsed' || isMobile}>{tooltip}</TooltipContent
			>{:else}<TooltipContent
				hidden={stateValue !== 'collapsed' || isMobile}
				{...tooltip}
			/>{/if}</Tooltip
	>{/if}
