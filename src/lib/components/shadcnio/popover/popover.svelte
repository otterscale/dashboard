<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let {
		lazyMount = true,
		unmountOnExit = true,
		modal = true,
		...rest
	}: ComponentProps<typeof ArkPopover.Root> = $props();
</script>

<ArkPopover.Root {lazyMount} {modal} {unmountOnExit} {...rest} />
