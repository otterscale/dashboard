import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';

export interface DataListProps extends Omit<ComponentProps<typeof Ark<'dl'>>, 'as'> {
	/**
	 * Layout of each item. The list itself is always stacked.
	 * `horizontal` places label and value in a row.
	 * `vertical` stacks label above value.
	 *
	 * @default "horizontal"
	 */
	orientation?: 'horizontal' | 'vertical';
}
