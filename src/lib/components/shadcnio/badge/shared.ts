/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const badgeVariants = tv({
	base: [
		'h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&>svg]:size-3! group/badge relative inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none'
	],
	defaultVariants: {
		pill: false,
		size: 'md',
		variant: 'default'
	},
	variants: {
		pill: {
			true: 'rounded-full'
		},
		size: {
			lg: 'h-6.5 min-w-6.5 px-2 text-sm',
			md: '',
			sm: 'h-5 min-w-5 px-1'
		},
		variant: {
			default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
			destructive:
				'bg-destructive/10 [a]:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
			ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
			info: [
				'bg-info/10',
				'text-info-foreground',
				'border-info/20',
				'focus-visible:border-info focus-visible:ring-info/50',
				'[a&]:hover:bg-info/20'
			],
			link: 'text-primary underline-offset-4 hover:underline',
			outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
			secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
			success: [
				'bg-success/10',
				'text-success-foreground',
				'border-success/20',
				'focus-visible:border-success focus-visible:ring-success/20',
				'[a&]:hover:bg-success/20'
			],
			warning: [
				'bg-warning/10',
				'text-warning-foreground',
				'border-warning/20',
				'focus-visible:border-warning focus-visible:ring-warning/20',
				'dark:focus-visible:ring-warning/40',
				'[a&]:hover:bg-warning/20'
			]
		}
	}
});

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export interface BadgeProps
	extends Omit<ComponentProps<typeof Ark<'span'>>, 'as'>, VariantProps<typeof badgeVariants> {}
