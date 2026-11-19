import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const cardMediaVariants = tv({
	base: ['flex shrink-0 items-center gap-2', '[&_svg]:pointer-events-none', 'px-(--card-spacing)'],
	defaultVariants: {
		variant: 'default'
	},
	variants: {
		variant: {
			default: 'bg-transparent',
			icon: "[&_svg:not([class*='size-'])]:size-4",
			image: ['overflow-hidden rounded-t-sm', 'px-0', '[&_img]:size-full [&_img]:object-cover']
		}
	}
});

export interface CardMediaProps
	extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'>, VariantProps<typeof cardMediaVariants> {}

export interface CardHeaderProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * The description of the card
	 */
	description?: string;
	/**
	 * The title of the card
	 */
	title?: string;
}
