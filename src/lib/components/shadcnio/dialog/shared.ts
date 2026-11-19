/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import {
	Dialog as ArkDialog,
	useDialog as useArkDialog,
	useDialogContext as useArkDialogContext
} from '@ark-ui/svelte/dialog';
import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { getContext } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '$lib/utils';

import { DialogModalContext_DEFAULT, DialogModalContext_KEY } from './context-keys';

export const useDialog = useArkDialog;

export const useDialogContext = useArkDialogContext;

export const DialogContext = ArkDialog.Context;

export interface DialogContextProps {
	/**
	 * Used internally to show or hide overlay
	 *
	 * @default true
	 */
	modal?: boolean;
}

export const dialogOverlayVariants = tv({
	base: 'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50'
});

export const dialogContentVariants = tv({
	base: [
		'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1 duration-100 sm:max-w-sm relative z-50 row-start-2 min-h-min w-full max-w-full outline-none'
	],
	defaultVariants: {
		size: 'md'
	},
	variants: {
		bottomStickOnMobile: {
			true: [
				'max-sm:max-h-[calc(100svh-3rem)]',
				'max-sm:max-w-none',
				'max-sm:rounded-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-t max-sm:border-b-0',
				// zag's count of the dialogs open on top of this one (Base UI's
				// `--nested-dialogs`): a parent fades out under a nested dialog.
				'max-sm:opacity-[calc(1-min(var(--nested-layer-count),1))]',
				'max-sm:data-[state=closed]:slide-out-to-bottom-5 max-sm:data-[state=open]:slide-in-from-bottom-5',
				'max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:zoom-in-100'
			]
		},
		// From `sm:` up, as the skin's own `sm:max-w-sm`, so a size still wins
		// once the skin is inlined into the installed file (and a `sm:max-w-*`
		// in `className` still beats the size).
		size: {
			'2xl': ['sm:max-w-3xl'],
			'3xl': ['sm:max-w-4xl'],
			'4xl': ['sm:max-w-5xl'],
			'5xl': ['sm:max-w-6xl'],
			'6xl': ['sm:max-w-7xl'],
			fullscreen: ['size-full max-w-none sm:max-w-none'],
			lg: ['sm:max-w-xl'],
			md: ['sm:max-w-lg'],
			sm: ['sm:max-w-md'],
			xl: ['sm:max-w-2xl']
		}
	}
});

export interface DialogContentProps
	extends ComponentProps<typeof ArkDialog.Content>, VariantProps<typeof dialogContentVariants> {
	/**
	 * Stick the dialog to the bottom of the screen on mobile
	 *
	 * @default true
	 */
	bottomStickOnMobile?: boolean;
	/**
	 * Class names on the positioner (the viewport-fixed wrapper).
	 */
	positionerClassName?: string;
	/**
	 * Show close button at the top right corner
	 *
	 * @default true
	 */
	showCloseButton?: boolean;
}

export interface DialogBodyProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * Add a fade effect to the scroll area
	 *
	 * @default false
	 */
	scrollFade?: boolean;
}

export interface DialogHeaderProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * The description of the dialog
	 */
	description?: string;
	/**
	 * The title of the dialog
	 */
	title?: string;
}

export interface DialogFooterProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * Show a close button in the footer
	 *
	 * @default false
	 */
	showCloseButton?: boolean;
}

export const _useDialog = () => {
	const context =
		getContext<typeof DialogModalContext_DEFAULT>(DialogModalContext_KEY) ??
		DialogModalContext_DEFAULT;

	if (!context) {
		throw new Error('useDialog must be used within a DialogProvider');
	}

	return context;
};
