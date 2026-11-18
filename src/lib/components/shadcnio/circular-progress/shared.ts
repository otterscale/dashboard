import {
	Progress as ArkProgress,
	useProgress as useArkProgress,
	useProgressContext as useArkProgressContext
} from '@ark-ui/svelte/progress';

import { cn } from '$lib/utils';

export const useCircularProgress = useArkProgress;

export const useCircularProgressContext = useArkProgressContext;

export const CircularProgressContext = ArkProgress.Context;

export const DEFAULT_SIZE = 32;

export const DEFAULT_THICKNESS = 4;

export interface CircularProgressSizeProps {
	/**
	 * Width and height of the circle, in pixels.
	 *
	 * @default 32
	 */
	size?: number;
	/**
	 * Stroke width of the circle, in pixels.
	 *
	 * @default 4
	 */
	thickness?: number;
}

export const circularProgressRootClassName = cn(
	'group/circular-progress',
	'relative',
	'inline-flex flex-col items-center justify-center'
);

export const sizeStyle = (size: number, thickness: number) =>
	({
		'--size': `${size}px`,
		'--thickness': `${thickness}px`
	}) as Record<string, string | number | undefined>;

export const clampValue = (value: number | null | undefined, min = 0, max = 100) =>
	value === null || value === undefined ? value : Math.min(max, Math.max(min, value));
