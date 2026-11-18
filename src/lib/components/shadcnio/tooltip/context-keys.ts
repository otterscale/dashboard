import type { TooltipProviderContextValue } from './shared';
export const TooltipProviderContext_KEY = Symbol('TooltipProviderContext');
export const TooltipProviderContext_DEFAULT: TooltipProviderContextValue = {
	closeDelay: 100,
	openDelay: 0
};
