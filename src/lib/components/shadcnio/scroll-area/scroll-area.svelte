<script lang="ts">
	import { ScrollArea as ArkScrollArea } from '@ark-ui/svelte/scroll-area';

	import { cn } from '$lib/utils';

	import ScrollAreaScrollbar from './scroll-area-scrollbar.svelte';
	import ScrollAreaViewport from './scroll-area-viewport.svelte';
	import { type ScrollAreaProps, scrollAreaVariants } from './shared';
	let {
		scrollFade = false,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ScrollAreaProps = $props();
</script>

<ArkScrollArea.Root
	class={cn(
		'cn-scroll-area relative flex size-full min-h-0 flex-col overflow-hidden [--fade-size:1.5rem]',
		className
	)}
	data-slot="scroll-area"
	{...rest}
	bind:ref
	><ScrollAreaViewport
		class={cn('cn-scroll-area-viewport', scrollAreaVariants({ scrollFade }))}
		data-slot="scroll-area-viewport"
		><ArkScrollArea.Content data-slot="scroll-area-content"
			>{@render children?.()}</ArkScrollArea.Content
		></ScrollAreaViewport
	><ScrollAreaScrollbar orientation="vertical" /><ScrollAreaScrollbar
		orientation="horizontal"
	/><ArkScrollArea.Corner data-slot="scroll-area-corner" /></ArkScrollArea.Root
>
