import { Dialog as ArkDialog, useDialogContext } from '@ark-ui/svelte/dialog';
import type { ComponentProps } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { tv, type VariantProps } from 'tailwind-variants';

export const useSheet = useDialogContext;

export const sheetPositionerVariants = tv({
	base: ['fixed inset-0 z-50', 'h-svh w-screen', 'overflow-hidden'],
	defaultVariants: {
		variant: 'default'
	},
	variants: {
		variant: {
			default: '',
			inset: [
				'[--inset:--spacing(0)]',
				'px-(--inset) sm:[--inset:--spacing(4)]',
				'data-[side=bottom]:pb-(--inset)',
				'data-[side=top]:pt-(--inset)',
				'data-[side=left]:pt-(--inset) data-[side=left]:pb-(--inset)',
				'data-[side=right]:pt-(--inset) data-[side=right]:pb-(--inset)'
			]
		}
	}
});

export type SheetSide = 'top' | 'right' | 'bottom' | 'left';

export interface SheetPositionerProps
	extends
		ComponentProps<typeof ArkDialog.Positioner>,
		VariantProps<typeof sheetPositionerVariants> {
	/** @deprecated Prefer `side`. Kept for existing callers. */
	placement?: SheetSide;
	/** Edge of the screen where the sheet appears. */
	side?: SheetSide;
}

export interface SheetContentProps
	extends ComponentProps<typeof ArkDialog.Content>, VariantProps<typeof sheetPositionerVariants> {
	/** @deprecated Prefer `side`. Kept for Sidebar and other callers. */
	placement?: SheetSide;
	/**
	 * Show close button at the top right corner
	 *
	 * @default true
	 */
	showCloseButton?: boolean;
	/**
	 * Edge of the screen where the sheet appears.
	 *
	 * @default "right"
	 */
	side?: SheetSide;
}

export interface SheetHeaderProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * The description of the sheet
	 */
	description?: string;
	/**
	 * The title of the sheet
	 */
	title?: string;
}
