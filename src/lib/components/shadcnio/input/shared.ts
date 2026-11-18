import { FieldInput } from '@ark-ui/svelte/field';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const inputVariants = tv({
	base: 'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-3 aria-invalid:ring-3 md:text-sm w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
	defaultVariants: {
		size: 'md'
	},
	variants: {
		size: {
			lg: 'h-9',
			md: 'h-8',
			sm: 'h-7'
		}
	}
});

export interface InputProps
	extends Omit<ComponentProps<typeof FieldInput>, 'size'>, VariantProps<typeof inputVariants> {}
