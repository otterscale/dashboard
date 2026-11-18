<script lang="ts">
	import { ScrollArea as ArkScrollArea } from '@ark-ui/svelte/scroll-area';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		orientation,
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkScrollArea.Scrollbar> = $props();
	const vertical = $derived(orientation !== 'horizontal');
</script>

<ArkScrollArea.Scrollbar
	class={cn(
		'group/scrollbar flex touch-none bg-transparent select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-s data-vertical:border-s-transparent',
		'opacity-0 transition-opacity delay-300',
		'data-hover:opacity-100 data-hover:delay-0 data-hover:duration-100',
		'data-scrolling:opacity-100 data-scrolling:delay-0 data-scrolling:duration-100',
		vertical
			? 'w-2 flex-col data-[orientation=vertical]:in-[[data-slot=scroll-area]:not([data-overflow-y])]:hidden'
			: 'h-2 data-[orientation=horizontal]:in-[[data-slot=scroll-area]:not([data-overflow-x])]:hidden',
		'motion-reduce:transition-none!',
		className
	)}
	data-slot="scroll-area-scrollbar"
	{orientation}
	{...rest}
	bind:ref
	><ArkScrollArea.Thumb
		class={cn(
			'relative shrink-0 rounded-full bg-foreground/8',
			'transition-[width,height,background-color] duration-150 ease-out',
			'group-hover/scrollbar:bg-foreground/12 data-hover:bg-foreground/12',
			vertical
				? 'mx-auto my-0.5 w-1 group-hover/scrollbar:w-1.5 data-hover:w-1.5'
				: 'mx-0.5 my-auto h-1 group-hover/scrollbar:h-1.5 data-hover:h-1.5',
			'motion-reduce:transition-none!'
		)}
		data-slot="scroll-area-thumb"
	/></ArkScrollArea.Scrollbar
>
