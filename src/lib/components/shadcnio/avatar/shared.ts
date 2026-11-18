import {
	Avatar as ArkAvatar,
	useAvatar as useArkAvatar,
	useAvatarContext as useArkAvatarContext
} from '@ark-ui/svelte/avatar';
import type { ComponentProps } from 'svelte';

export const useAvatar = useArkAvatar;

export const useAvatarContext = useArkAvatarContext;

export const AvatarContext = ArkAvatar.Context;

export interface AvatarProps extends ComponentProps<typeof ArkAvatar.Root> {
	size?: 'default' | 'sm' | 'lg';
}
