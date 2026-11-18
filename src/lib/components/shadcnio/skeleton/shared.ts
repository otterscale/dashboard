import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';

export interface SkeletonTextProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * The number of lines of the skeleton text.
	 *
	 * @default 2
	 */
	lines?: number;
}
