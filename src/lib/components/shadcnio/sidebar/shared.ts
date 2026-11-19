/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { getContext } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { tv } from 'tailwind-variants';

import { Collapsible } from '$lib/components/shadcnio/collapsible';
import { TooltipContent } from '$lib/components/shadcnio/tooltip';
import { cn } from '$lib/utils';

import { SidebarContext_DEFAULT, SidebarContext_KEY } from './context-keys';
import type SidebarGroupContent from './sidebar-group-content.svelte';

export const SIDEBAR_COOKIE_NAME = 'sidebar_state';

export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const SIDEBAR_WIDTH = '16rem';

export const SIDEBAR_WIDTH_MOBILE = '18rem';

export const SIDEBAR_WIDTH_ICON = '3rem';

export const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

export const SIDEBAR_MIN_WIDTH = 160;

export const SIDEBAR_MAX_WIDTH = 360;

export const SIDEBAR_COLLAPSE_SLOP = 56;

export const SIDEBAR_PANEL_MOTION =
	'duration-200 ease-linear motion-reduce:transition-none! in-data-[resizing]:transition-none!';

export interface SidebarContextProps {
	/** The direction the sidebar's layout reads in, measured after mount. */
	dir: 'ltr' | 'rtl';
	isMobile: boolean;
	open: boolean;
	openMobile: boolean;
	setOpen: (open: boolean) => void;
	setOpenMobile: (open: boolean) => void;
	state: 'expanded' | 'collapsed';
	toggleSidebar: () => void;
}

export interface SidebarProviderProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * The default open state of the sidebar.
	 *
	 * @default true
	 */
	defaultOpen?: boolean;
	/**
	 * The function to call when the open state of the sidebar changes.
	 */
	onOpenChange?: (open: boolean) => void;
	/**
	 * The open state of the sidebar.
	 */
	open?: boolean;
	/**
	 * Persist the desktop open state to a cookie.
	 *
	 * @default true
	 */
	persist?: boolean;
	/**
	 * Toggle the sidebar with ⌘B / Ctrl+B.
	 *
	 * @default true
	 */
	shortcut?: boolean;
}

export interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Collapse behavior on desktop.
	 *
	 * @default "offcanvas"
	 */
	collapsible?: 'offcanvas' | 'icon' | 'none';
	/**
	 * Which edge of the layout the sidebar sits on.
	 *
	 * @default "left"
	 */
	placement?: 'left' | 'right';
	/**
	 * Visual treatment of the rail.
	 *
	 * @default "sidebar"
	 */
	variant?: 'sidebar' | 'floating' | 'inset';
}

export interface SidebarContentProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Whether to add a scroll fade effect to the sidebar content.
	 *
	 * @default false
	 */
	scrollFade?: boolean;
}

export interface SidebarGroupProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * Makes the group's label a toggle that collapses `SidebarGroupContent`.
	 *
	 * @default false
	 */
	collapsible?: boolean;
	/**
	 * Uncontrolled initial open state when `collapsible` is true.
	 *
	 * @default true
	 */
	defaultOpen?: boolean;
	/**
	 * Called when a collapsible group opens or closes.
	 */
	onOpenChange?: ComponentProps<typeof Collapsible>['onOpenChange'];
	/**
	 * Controlled open state when `collapsible` is true.
	 */
	open?: boolean;
}

export const sidebarMenuButtonVariants = tv({
	base: [
		'ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground gap-2 rounded-md p-2 text-start text-sm transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pe-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 data-active:font-medium peer/menu-button group/menu-button',
		'flex w-full min-w-0 items-center gap-2 overflow-hidden',
		'rounded-md px-2',
		'text-left font-normal text-sidebar-foreground text-sm',
		'outline-none ring-sidebar-ring',
		'transition-[box-shadow,width,height,padding]',
		'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
		'active:bg-sidebar-accent active:text-sidebar-accent-foreground',
		'focus-visible:ring-2',
		'disabled:pointer-events-none disabled:opacity-50',
		'aria-disabled:pointer-events-none aria-disabled:opacity-50',
		'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
		'data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground',
		'group-has-data-[sidebar=menu-action]/menu-item:pe-8',
		'[&>span:last-child]:min-w-0 [&>span:last-child]:truncate',
		'[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55',
		'hover:[&_svg]:text-sidebar-accent-foreground',
		'data-[active=true]:[&_svg]:text-sidebar-accent-foreground',
		'motion-reduce:transition-none!'
	],
	defaultVariants: {
		size: 'md',
		variant: 'default'
	},
	variants: {
		size: {
			lg: 'group-data-[collapsible=icon]:p-0! h-12 text-sm',
			md: 'h-8 text-sm',
			sm: 'h-7 text-xs'
		},
		variant: {
			default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
			ghost: '',
			outline:
				'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:shadow-[0_0_0_1px_var(--sidebar-accent)]'
		}
	}
});

export type SidebarMenuButtonSize = 'sm' | 'md' | 'lg' | 'default';

export interface SidebarMenuButtonProps extends Omit<
	Omit<ComponentProps<typeof Ark<'button'>>, 'as'>,
	'size'
> {
	/**
	 * Whether the button is active.
	 *
	 * @default false
	 */
	isActive?: boolean;
	/**
	 * Visual size of the row. `default` matches `md`.
	 *
	 * @default "md"
	 */
	size?: SidebarMenuButtonSize;
	/**
	 * The tooltip to display when hovering over the button.
	 */
	tooltip?: string | ComponentProps<typeof TooltipContent>;
	/**
	 * @default "default"
	 */
	variant?: 'default' | 'ghost' | 'outline';
}

export interface SidebarMenuActionProps extends Omit<ComponentProps<typeof Ark<'button'>>, 'as'> {
	/**
	 * Hides the action until its menu item is hovered or focused, or its menu is
	 * open. Always shown below `md`.
	 */
	showOnHover?: boolean;
}

export interface SidebarMenuSkeletonProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/** Draws an icon placeholder before the text line. */
	showIcon?: boolean;
}

export interface SidebarMenuSubButtonProps extends Omit<ComponentProps<typeof Ark<'a'>>, 'as'> {
	/** Whether the link is the current page: highlighted, and `data-active`. */
	isActive?: boolean;
	size?: 'sm' | 'md';
}

export const useSidebar = () => {
	const context =
		getContext<typeof SidebarContext_DEFAULT>(SidebarContext_KEY) ?? SidebarContext_DEFAULT;

	if (context === null) {
		throw new Error('useSidebar must be used within a SidebarProvider.');
	}

	return context;
};
