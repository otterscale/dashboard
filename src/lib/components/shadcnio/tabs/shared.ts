import {
	Tabs as ArkTabs,
	useTabs as useArkTabs,
	useTabsContext as useArkTabsContext
} from '@ark-ui/svelte/tabs';
import type { ComponentProps } from 'svelte';
import { tv } from 'tailwind-variants';

import { cn } from '$lib/utils';

export const useTabs = useArkTabs;

export const useTabsContext = useArkTabsContext;

export const TabsContext = ArkTabs.Context;

export const tabsRootClassName = cn(
	'gap-2 group/tabs flex data-horizontal:flex-col',
	'data-[orientation=vertical]:flex-row'
);

export const tabsListVariants = tv({
	defaultVariants: {
		variant: 'default'
	},
	slots: {
		base: [
			'rounded-lg p-[3px] group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list relative z-0 inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col'
		],
		indicator: [
			'cn-tabs-indicator pointer-events-none absolute top-(--top) left-(--left)',
			'h-(--height) w-(--width)',
			// zag-js drives the transition inline; these vars are its contract.
			'[--transition-duration:200ms] [--transition-timing-function:ease-in-out]',
			'motion-reduce:[--transition-duration:0ms]'
		]
	},
	variants: {
		variant: {
			default: {
				base: ['cn-tabs-list-variant-default bg-transparent'],
				indicator: ['z-0 rounded-[inherit] bg-accent']
			},
			line: {
				base: ['cn-tabs-list-variant-line gap-1 bg-transparent'],
				indicator: [
					'z-10',
					'bg-foreground',
					'data-[orientation=horizontal]:top-auto data-[orientation=horizontal]:bottom-0',
					'data-[orientation=horizontal]:h-0.5',
					'data-[orientation=vertical]:w-0.5'
				]
			}
		}
	}
});

export interface TabsListProps extends ComponentProps<typeof ArkTabs.List> {
	/**
	 * The visual style. `underline` is the earlier name of `line` and still
	 * works.
	 *
	 * @default "default"
	 */
	variant?: 'default' | 'line' | 'underline';
}

export const listVariant = (variant: TabsListProps['variant']) =>
	variant === 'underline' ? 'line' : variant;
