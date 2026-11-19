<script lang="ts">
	import { Tooltip as ArkTooltip } from '@ark-ui/svelte/tooltip';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		style,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkTooltip.Arrow> = $props();
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

<ArkTooltip.Arrow
	class={cn(
		'z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] data-[side=inline-end]:-start-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:-end-1 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-translate-y-1/2',
		className
	)}
	data-slot="tooltip-arrow"
	style={cssText(
		{
			'--arrow-background': 'var(--foreground)',
			'--arrow-size': 'calc(1.5 * var(--spacing))',
			rotate: 'none',
			translate: 'none'
		},
		style
	)}
	{...rest}
	bind:ref><ArkTooltip.ArrowTip /></ArkTooltip.Arrow
>
