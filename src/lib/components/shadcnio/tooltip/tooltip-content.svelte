<script lang="ts">
	import { Portal } from '@ark-ui/svelte/portal';
	import { Tooltip as ArkTooltip } from '@ark-ui/svelte/tooltip';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import TooltipArrow from './tooltip-arrow.svelte';
	let {
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkTooltip.Content> = $props();
</script>

<Portal
	><ArkTooltip.Positioner class="isolate z-50" data-slot="tooltip-positioner"
		><ArkTooltip.Content
			class={cn(
				'z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pe-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className
			)}
			data-slot="tooltip-content"
			{...rest}
			bind:ref>{@render children?.()}<TooltipArrow /></ArkTooltip.Content
		></ArkTooltip.Positioner
	></Portal
>
