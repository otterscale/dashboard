/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const alertVariants = tv({
	base: "grid gap-0.5 rounded-lg border px-2.5 py-2 text-start text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pe-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 group/alert relative w-full",
	defaultVariants: {
		variant: 'default'
	},
	variants: {
		variant: {
			default: 'bg-card text-card-foreground',
			destructive:
				'text-destructive bg-card *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
			info: [
				'bg-info/4',
				'border-info/32',
				'[&_svg]:text-info',
				'[&_[data-slot=alert-action]_[data-variant=ghost]]:hover:bg-info/10'
			],
			success: [
				'bg-success/4',
				'border-success/32',
				'[&_svg]:text-success',
				'[&_[data-slot=alert-action]_[data-variant=ghost]]:hover:bg-success/10'
			],
			warning: [
				'bg-warning/4',
				'border-warning/32',
				'[&_svg]:text-warning',
				'[&_[data-slot=alert-action]_[data-variant=ghost]]:hover:bg-warning/10'
			]
		}
	}
});

export interface AlertProps
	extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'>, VariantProps<typeof alertVariants> {}
