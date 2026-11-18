<script lang="ts">
	import { ScrollArea as ArkScrollArea, useScrollAreaContext } from '@ark-ui/svelte/scroll-area';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkScrollArea.Viewport> = $props();
	const scrollArea = useScrollAreaContext();
</script>

<ArkScrollArea.Viewport
	tabindex={scrollArea().hasOverflowX || scrollArea().hasOverflowY ? 0 : undefined}
	{...props}
	bind:ref
/>
