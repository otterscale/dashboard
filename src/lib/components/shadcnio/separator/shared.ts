import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';

export interface SeparatorProps extends Omit<ComponentProps<typeof Ark<'div'>>, 'as'> {
	/**
	 * The orientation of the separator.
	 *
	 * @default "horizontal"
	 */
	orientation?: 'horizontal' | 'vertical';
}
