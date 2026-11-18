<script lang="ts">
	import { Collapsible as ArkCollapsible } from '@ark-ui/svelte/collapsible';
	import type { ComponentProps } from 'svelte';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkCollapsible.Trigger> = $props();
</script>

<ArkCollapsible.Trigger class={className} data-slot="collapsible-trigger" {...rest} bind:ref />
