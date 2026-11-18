<script lang="ts">
	import { Collapsible as ArkCollapsible } from '@ark-ui/svelte/collapsible';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import { splitCollapsedMount } from './shared';
	let {
		collapsedHeight,
		lazyMount,
		unmountOnExit,
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkCollapsible.Root> = $props();
	const mount = $derived(
		splitCollapsedMount({
			collapsedHeight,
			lazyMount,
			unmountOnExit
		})
	);
</script>

<ArkCollapsible.Root
	class={cn('group/collapsible', className)}
	data-slot="collapsible"
	{...mount}
	{...rest}
	bind:ref
/>
