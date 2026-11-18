<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let { style, ref = $bindable(null), ...rest }: ComponentProps<typeof ArkPopover.Arrow> = $props();
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

<ArkPopover.Arrow
	data-slot="popover-arrow"
	style={cssText(
		{ '--arrow-background': 'var(--popover)', '--arrow-size': 'calc(1.5 * var(--spacing))' },
		style
	)}
	{...rest}
	bind:ref><ArkPopover.ArrowTip class="border-t border-l" /></ArkPopover.Arrow
>
