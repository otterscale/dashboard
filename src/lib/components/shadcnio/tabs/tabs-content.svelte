<script lang="ts">
	import { Tabs as ArkTabs } from '@ark-ui/svelte/tabs';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkTabs.Content> = $props();
</script>

<ArkTabs.Content
	class={cn(
		'flex-1 text-sm outline-none',
		// The panel is a tab stop. Its ring is drawn inside it, where no
		// parent overflow clips it and no content covers it.
		'focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring/50 focus-visible:outline-solid',
		className
	)}
	data-slot="tabs-content"
	{...rest}
	bind:ref
/>
