import { ScrollArea as ArkScrollArea, useScrollAreaContext } from '@ark-ui/svelte/scroll-area';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const useScrollArea = useScrollAreaContext;

export const scrollAreaVariants = tv({
	base: [
		'h-full',
		'min-h-0',
		'rounded-[inherit]',
		'outline-none',
		'scrollbar-none',
		// The root clips its overflow, so the ring is drawn inside the viewport,
		// where nothing clips it and the content doesn't cover it.
		'focus-visible:outline-3',
		'focus-visible:outline-ring/50',
		'focus-visible:outline-solid',
		'focus-visible:-outline-offset-3'
	],
	defaultVariants: {
		scrollFade: false
	},
	variants: {
		/** Fades the content out at the edges it can still scroll to. */
		scrollFade: {
			true: [
				'data-overflow-y:not-data-at-top:mask-t-from-[calc(100%-var(--fade-size))]',
				'data-overflow-y:not-data-at-bottom:mask-b-from-[calc(100%-var(--fade-size))]',
				'transition-shadow',
				'motion-reduce:transition-none!'
			]
		}
	}
});

export interface ScrollAreaProps
	extends ComponentProps<typeof ArkScrollArea.Root>, VariantProps<typeof scrollAreaVariants> {}
