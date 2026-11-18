import type { Ark } from '@ark-ui/svelte/factory';
import { Popover as ArkPopover, usePopoverContext } from '@ark-ui/svelte/popover';
import type { ComponentProps } from 'svelte';

export const usePopover = usePopoverContext;

export interface PopoverContentProps extends ComponentProps<typeof ArkPopover.Content> {
	/**
	 * Show a close button in the top corner at the end of the line (top right
	 * in left-to-right text)
	 *
	 * @default false
	 */
	showCloseButton?: boolean;
}

export interface PopoverLabelsContextValue {
	setDescribed: (described: boolean) => void;
	setLabelled: (labelled: boolean) => void;
}

export interface PopoverHeaderProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * The description of the popover header
	 */
	description?: string;
	/**
	 * The title of the popover header
	 */
	title?: string;
}
