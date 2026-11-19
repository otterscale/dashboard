/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import { tv } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const emptyMediaVariants = tv({
	base: 'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
	defaultVariants: {
		variant: 'default'
	},
	variants: {
		variant: {
			default: 'bg-transparent',
			icon: "bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-4"
		}
	}
});
