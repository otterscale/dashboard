<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { cn } from '$lib/utils';

	import type { SidebarMenuSkeletonProps } from './shared';
	let {
		class: className,
		showIcon = false,
		ref = $bindable(null),
		...rest
	}: SidebarMenuSkeletonProps = $props();
	const width = $derived.by(() => `${Math.floor(Math.random() * 40) + 50}%`);
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

<Ark
	as="div"
	class={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
	data-sidebar="menu-skeleton"
	data-slot="sidebar-menu-skeleton"
	{...rest}
	bind:ref
	>{#if !!showIcon}<Skeleton
			class="size-4 rounded-md"
			data-sidebar="menu-skeleton-icon"
		/>{/if}<Skeleton
		class="h-4 max-w-(--skeleton-width) flex-1"
		data-sidebar="menu-skeleton-text"
		style={cssText({ '--skeleton-width': width })}
	/></Ark
>
