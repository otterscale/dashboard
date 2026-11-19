<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
	import { Ark } from '@ark-ui/svelte/factory';

	import { Sheet, SheetContent, SheetHeader } from '$lib/components/shadcnio/sheet';
	import { cn } from '$lib/utils';

	import {
		SIDEBAR_PANEL_MOTION,
		SIDEBAR_WIDTH_MOBILE,
		type SidebarProps,
		useSidebar
	} from './shared';
	import Sidebar from './sidebar.svelte';
	import SidebarPlacementContext from './sidebar-placement-context.svelte';
	let {
		collapsible = 'offcanvas',
		placement = 'left',
		variant = 'sidebar',
		class: className,
		children,
		...rest
	}: SidebarProps = $props();
	const __useSidebar1 = useSidebar();
	const { dir, isMobile, state: stateValue, openMobile, setOpenMobile } = $derived(__useSidebar1);
	const edge = $derived((placement === 'left') === (dir === 'ltr') ? 'left' : 'right');
	const onMobileOpenChange = (details: { open: boolean }) => {
		setOpenMobile(details.open);
	};
	const cssText = (
		...styles: (
			| Record<string, string | number | boolean | null | undefined>
			| string
			| null
			| undefined
		)[]
	) => {
		const parts = styles.map((style) =>
			typeof style === 'object' && style !== null
				? Object.entries(style)
						.filter(([, value]) => value != null && value !== false)
						.map(([key, value]) => {
							const name = key.startsWith('--')
								? key
								: key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
							const unitless =
								key.startsWith('--') ||
								/^(aspectRatio|flex|flexGrow|flexShrink|fontWeight|lineHeight|opacity|order|scale|zIndex|zoom)$/.test(
									key
								);
							return `${name}: ${typeof value === 'number' && !unitless ? `${value}px` : value}`;
						})
						.join('; ')
				: style
		);
		// Later parts win, as later keys of a style object do.
		return parts.length === 1 ? parts[0] : parts.filter(Boolean).join('; ');
	};
</script>

{#if isMobile}<Sheet onOpenChange={onMobileOpenChange} open={openMobile}
		><SheetContent
			class={cn(
				'w-(--sidebar-width)',
				'p-0',
				'bg-sidebar',
				'text-sidebar-foreground',
				'[&>button]:hidden'
			)}
			data-mobile="true"
			data-sidebar="sidebar"
			data-slot="sidebar"
			side={edge}
			style={cssText({ '--sidebar-width': SIDEBAR_WIDTH_MOBILE })}
			><SheetHeader
				class="sr-only"
				description="Displays the mobile sidebar."
				title="Sidebar"
			/><Ark as="div" class="flex size-full flex-col"
				><SidebarPlacementContext value={placement}>{@render children?.()}</SidebarPlacementContext
				></Ark
			></SheetContent
		></Sheet
	>{:else}{/if}<Ark
	as="div"
	class={cn(
		'group peer hidden shrink-0 self-stretch md:block',
		'text-sidebar-foreground',
		placement === 'right' && 'order-last',
		className
	)}
	data-collapsible={stateValue === 'collapsed' ? collapsible : ''}
	data-placement={placement}
	data-slot="sidebar"
	data-state={stateValue}
	data-variant={variant}
	{...rest}
	><Ark
		as="div"
		class={cn(
			'relative h-full bg-transparent transition-[width] duration-200 ease-linear',
			'w-(--sidebar-width)',
			'transition-[width]',
			SIDEBAR_PANEL_MOTION,
			'group-data-[collapsible=offcanvas]:w-0',
			variant === 'floating' || variant === 'inset'
				? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
				: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
		)}
		data-slot="sidebar-gap"
	/><Ark
		as="div"
		class={cn(
			'absolute inset-y-0 z-10 flex h-full w-(--sidebar-width) flex-col',
			'transition-[inset-inline-start,inset-inline-end,width]',
			SIDEBAR_PANEL_MOTION,
			placement === 'left'
				? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
				: 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
			(variant === 'floating' || variant === 'inset') && 'p-2',
			variant === 'sidebar' &&
				(placement === 'left'
					? 'border-e border-sidebar-border'
					: 'border-s border-sidebar-border'),
			variant === 'floating' || variant === 'inset'
				? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
				: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
		)}
		data-slot="sidebar-container"
		><Ark
			as="div"
			class={cn(
				'flex size-full min-h-0 flex-col overflow-hidden bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border',
				'bg-sidebar text-sidebar-foreground',
				'group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm'
			)}
			data-sidebar="sidebar"
			data-slot="sidebar-inner"
			><SidebarPlacementContext value={placement}>{@render children?.()}</SidebarPlacementContext
			></Ark
		></Ark
	></Ark
>
