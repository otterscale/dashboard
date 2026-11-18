import {
	SegmentGroup as ArkSegmentGroup,
	useSegmentGroupContext
} from '@ark-ui/svelte/segment-group';
import type { ComponentProps } from 'svelte';

export const useSegmentGroup = useSegmentGroupContext;

export type SegmentGroupVariant = 'default' | 'underline';

export interface SegmentGroupProps extends ComponentProps<typeof ArkSegmentGroup.Root> {
	/**
	 * The visual variant of the segment group.
	 *
	 * @default "default"
	 */
	variant?: SegmentGroupVariant;
}
