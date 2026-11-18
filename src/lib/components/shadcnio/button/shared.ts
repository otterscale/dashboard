import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const buttonVariants = tv({
	base: [
		"focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap outline-none transition-transform disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		'data-disabled:pointer-events-none data-disabled:opacity-50',
		'aria-disabled:pointer-events-none aria-disabled:opacity-50',
		'data-[state=loading]:pointer-events-none'
	],
	defaultVariants: {
		clickEffect: true,
		pill: false,
		size: 'md',
		variant: 'default'
	},
	variants: {
		clickEffect: {
			true: 'active:not-aria-[haspopup]:scale-[0.98]'
		},
		pill: {
			true: 'rounded-full'
		},
		size: {
			/** shadcn/ui's name for `md`. */
			default:
				'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
			/** shadcn/ui's name for `icon-md`. */
			icon: 'size-8',
			'icon-lg': 'size-9',
			'icon-md': 'size-8',
			'icon-sm':
				'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
			'icon-xl': "size-10 [&_svg:not([class*='size-'])]:size-5",
			'icon-xs':
				"size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
			lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
			md: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
			sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
			xl: 'gap-1.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 h-10 px-4 text-base',
			xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3"
		},
		variant: {
			default: 'bg-primary text-primary-foreground hover:bg-primary/80',
			destructive:
				'bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30',
			ghost:
				'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground',
			link: 'text-primary underline-offset-4 hover:underline',
			outline:
				'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground',
			secondary:
				'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground'
		}
	},
	compoundVariants: [{ pill: true, class: 'rounded-full' }]
});

export interface ButtonProps
	extends Omit<ComponentProps<typeof Ark<'button'>>, 'as'>, VariantProps<typeof buttonVariants> {
	/**
	 * Apply a click effect to the button
	 *
	 * @default true
	 */
	clickEffect?: boolean;
	/**
	 * Show a loading indicator
	 *
	 * @default false
	 */
	isLoading?: boolean;
}
