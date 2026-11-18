import type { SidebarContextProps } from './shared';
export const SidebarContext_KEY = Symbol('SidebarContext');
export const SidebarContext_DEFAULT: SidebarContextProps | null = null;
export const SidebarPlacementContext_KEY = Symbol('SidebarPlacementContext');
export const SidebarPlacementContext_DEFAULT: 'left' | 'right' = 'left';
export const SidebarGroupCollapsibleContext_KEY = Symbol('SidebarGroupCollapsibleContext');
export const SidebarGroupCollapsibleContext_DEFAULT: boolean = false;
