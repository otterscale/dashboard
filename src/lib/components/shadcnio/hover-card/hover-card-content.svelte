<script lang="ts">
	import { HoverCard as ArkHoverCard } from '@ark-ui/svelte/hover-card';
	import { Portal } from '@ark-ui/svelte/portal';

	import { cn } from '$lib/utils';

	import HoverCardArrow from './hover-card-arrow.svelte';
	import type { HoverCardContentProps } from './shared';
	let {
		showArrow = true,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: HoverCardContentProps = $props();
</script>

<Portal
	><ArkHoverCard.Positioner data-slot="hover-card-positioner"
		><ArkHoverCard.Content
			class={cn(
				'z-50 w-64 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className
			)}
			data-slot="hover-card-content"
			{...rest}
			bind:ref
			>{@render children?.()}{#if !!showArrow}<HoverCardArrow />{/if}</ArkHoverCard.Content
		></ArkHoverCard.Positioner
	></Portal
>
