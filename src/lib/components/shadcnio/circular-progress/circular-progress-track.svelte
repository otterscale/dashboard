<script lang="ts">
	import {
		Progress as ArkProgress,
		useProgressContext as useArkProgressContext
	} from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import {
		type CircularProgressSizeProps,
		DEFAULT_SIZE,
		DEFAULT_THICKNESS,
		sizeStyle
	} from './shared';
	let {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		size = DEFAULT_SIZE,
		thickness = DEFAULT_THICKNESS,
		class: className,
		style,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Circle> & CircularProgressSizeProps = $props();
	const progress = useArkProgressContext();
	const name = $derived(
		ariaLabel === undefined && ariaLabelledBy === undefined
			? { 'aria-labelledby': progress().getLabelProps().id }
			: { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }
	);
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

<ArkProgress.Circle
	class={cn(
		'block',
		'pointer-events-none',
		'overflow-visible',
		'motion-reduce:animate-none!',
		// `motion-safe:`, since the group variant outranks the line above
		// and would keep the ring turning under reduced motion.
		'motion-safe:group-data-[state=indeterminate]/circular-progress:animate-spin!',
		className
	)}
	data-slot="circular-progress-circle"
	style={cssText(sizeStyle(size, thickness), style)}
	{...name}
	{...rest}
	bind:ref
	><ArkProgress.CircleTrack
		class="stroke-input"
		data-slot="circular-progress-track"
	/><ArkProgress.CircleRange
		class={cn(
			'stroke-primary',
			'[stroke-linecap:round]',
			'transition-[stroke-dashoffset] duration-300 ease-out',
			'motion-reduce:transition-none!',
			'data-[state=indeterminate]:[stroke-dasharray:calc(var(--circumference)*0.3)_var(--circumference)]'
		)}
		data-slot="circular-progress-range"
	/></ArkProgress.Circle
>
