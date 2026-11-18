import {
	Collapsible as ArkCollapsible,
	useCollapsible as useArkCollapsible,
	useCollapsibleContext as useArkCollapsibleContext
} from '@ark-ui/svelte/collapsible';
import type { ComponentProps } from 'svelte';

export const useCollapsible = useArkCollapsible;

export const useCollapsibleContext = useArkCollapsibleContext;

export const CollapsibleContext = ArkCollapsible.Context;

export const splitCollapsedMount = (props: {
	collapsedHeight?: ComponentProps<typeof ArkCollapsible.Root>['collapsedHeight'];
	lazyMount?: boolean;
	unmountOnExit?: boolean;
}) => {
	const { collapsedHeight, lazyMount, unmountOnExit } = props;
	const hasCollapsedHeight = collapsedHeight !== undefined && collapsedHeight !== null;

	return {
		collapsedHeight,
		'data-partial-collapse': hasCollapsedHeight ? '' : undefined,
		lazyMount: hasCollapsedHeight ? false : lazyMount,
		unmountOnExit: hasCollapsedHeight ? false : unmountOnExit
	};
};
