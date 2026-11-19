import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const statusVariants = tv({
	base: [
		'shrink-0 rounded-full',
		'flex items-center justify-center',
		'font-medium text-[10px]',
		'ring-2 ring-background',
		// An icon is sized from the dot rather than the preset, so it also
		// follows a size class given to the dot.
		"[&_svg:not([class*='size-'])]:size-[80%] [&_svg]:pointer-events-none [&_svg]:shrink-0"
	],
	defaultVariants: {
		size: 'md',
		variant: 'default'
	},
	variants: {
		size: {
			lg: 'size-3',
			md: 'size-2.5',
			sm: 'size-2'
		},
		variant: {
			default: 'bg-foreground text-background',
			destructive: 'bg-destructive text-white dark:bg-destructive-foreground',
			info: 'bg-info text-white',
			success: 'bg-success text-white',
			warning: 'bg-warning text-white'
		}
	}
});

export interface StatusProps
	extends Omit<ComponentProps<typeof Ark<'span'>>, 'as'>, VariantProps<typeof statusVariants> {}
