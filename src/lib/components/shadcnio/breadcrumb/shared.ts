import type { Ark } from '@ark-ui/svelte/factory';
import type { ComponentProps } from 'svelte';

export interface BreadcrumbProps extends Omit<ComponentProps<typeof Ark<'nav'>>, 'as'> {
	/**
	 * Accessible label for the breadcrumb navigation landmark.
	 *
	 * @default "breadcrumb"
	 */
	'aria-label'?: string;
}
