/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
import type { Ark } from '@ark-ui/svelte/factory';
import { useTooltipContext } from '@ark-ui/svelte/tooltip';
import type { Snippet } from 'svelte';

export const useTooltip = useTooltipContext;

export interface TooltipProviderContextValue {
	closeDelay: number;
	openDelay: number;
}

export interface TooltipProviderProps {
	children?: Snippet;
	/**
	 * Close delay in ms. Maps to Ark `closeDelay` on nested tooltips.
	 * @default 100
	 */
	closeDelay?: number;
	/**
	 * Open delay in ms. Maps to Ark `openDelay` / Base UI `delay`.
	 * @default 0
	 */
	delay?: number;
}
