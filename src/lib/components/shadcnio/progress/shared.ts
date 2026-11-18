import { useProgressContext } from '@ark-ui/svelte/progress';

export const useProgress = useProgressContext;

export const clampValue = (value: number | null | undefined, min = 0, max = 100) =>
	value === null || value === undefined ? value : Math.min(max, Math.max(min, value));
