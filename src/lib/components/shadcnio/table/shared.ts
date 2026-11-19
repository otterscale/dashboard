import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';

export interface TableProps extends Omit<ComponentProps<typeof Ark<'table'>>, 'as'> {
	/**
	 * Whether the table rows are hoverable.
	 *
	 * @default true
	 */
	isHoverable?: boolean;
	/**
	 * The variant of the table.
	 *
	 * @default "plain"
	 */
	variant?: 'plain' | 'striped';
}
