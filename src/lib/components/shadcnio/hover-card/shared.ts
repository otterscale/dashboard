import { HoverCard as ArkHoverCard, useHoverCardContext } from '@ark-ui/svelte/hover-card';
import type { ComponentProps } from 'svelte';

export const useHoverCard = useHoverCardContext;

export interface HoverCardProps extends ComponentProps<typeof ArkHoverCard.Root> {}

export interface HoverCardContentProps extends ComponentProps<typeof ArkHoverCard.Content> {
	/**
	 * Show the arrow that points at the trigger
	 *
	 * @default true
	 */
	showArrow?: boolean;
}
