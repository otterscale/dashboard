<script lang="ts">
	import { Collapsible as ArkCollapsible } from '@ark-ui/svelte/collapsible';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkCollapsible.RootProvider> = $props();
</script>

<ArkCollapsible.RootProvider
	class={cn('group/collapsible', className)}
	data-slot="collapsible"
	{...rest}
	bind:ref
/>
