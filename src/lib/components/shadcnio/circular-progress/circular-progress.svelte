<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import CircularProgressTrack from './circular-progress-track.svelte';
	import {
		circularProgressRootClassName,
		type CircularProgressSizeProps,
		clampValue,
		DEFAULT_SIZE,
		DEFAULT_THICKNESS,
		sizeStyle
	} from './shared';
	let {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		defaultValue,
		max,
		min,
		value,
		indeterminate = false,
		size = DEFAULT_SIZE,
		thickness = DEFAULT_THICKNESS,
		class: className,
		style,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Root> &
		CircularProgressSizeProps & {
			/**
			 * Shows indeterminate progress (`value={null}`).
			 *
			 * @default false
			 */
			indeterminate?: boolean;
		} = $props();
	const cssText = (
		...styles: (
			| Record<string, string | number | boolean | null | undefined>
			| string
			| null
			| undefined
		)[]
	) => {
		const parts = styles.map((style) =>
			typeof style === 'object' && style !== null
				? Object.entries(style)
						.filter(([, value]) => value != null && value !== false)
						.map(([key, value]) => {
							const name = key.startsWith('--')
								? key
								: key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
							const unitless =
								key.startsWith('--') ||
								/^(aspectRatio|flex|flexGrow|flexShrink|fontWeight|lineHeight|opacity|order|scale|zIndex|zoom)$/.test(
									key
								);
							return `${name}: ${typeof value === 'number' && !unitless ? `${value}px` : value}`;
						})
						.join('; ')
				: style
		);
		// Later parts win, as later keys of a style object do.
		return parts.length === 1 ? parts[0] : parts.filter(Boolean).join('; ');
	};
</script>

<ArkProgress.Root
	class={cn(circularProgressRootClassName, className)}
	data-slot="circular-progress"
	defaultValue={clampValue(defaultValue, min, max)}
	{max}
	{min}
	style={cssText(sizeStyle(size, thickness), style)}
	value={indeterminate ? null : clampValue(value, min, max)}
	{...rest}
	bind:ref
	>{@render children?.()}<CircularProgressTrack
		aria-label={ariaLabel}
		aria-labelledby={ariaLabelledBy}
		{size}
		{thickness}
	/></ArkProgress.Root
>
