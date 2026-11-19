<script lang="ts">
	import { Tabs as ArkTabs } from '@ark-ui/svelte/tabs';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import { tabsRootClassName } from './shared';
	let {
		lazyMount = true,
		unmountOnExit = true,
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkTabs.Root> = $props();
</script>

<ArkTabs.Root
	class={cn(tabsRootClassName, className)}
	data-slot="tabs"
	{lazyMount}
	{unmountOnExit}
	{...rest}
	bind:ref
/>
