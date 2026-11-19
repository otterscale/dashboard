import { Menu as ArkMenu, useMenuContext } from '@ark-ui/svelte/menu';
import type { ComponentProps } from 'svelte';

export const useMenu = useMenuContext;

export interface MenuGroupProps extends ComponentProps<typeof ArkMenu.ItemGroup> {
	/**
	 * The heading of the menu item group.
	 */
	heading?: string;
}

export interface MenuItemProps extends ComponentProps<typeof ArkMenu.Item> {
	variant?: 'default' | 'destructive';
}

export interface MenuRadioGroupProps extends ComponentProps<typeof ArkMenu.RadioItemGroup> {
	/**
	 * The heading of the menu radio item group.
	 */
	heading?: string;
}
