<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkPopover.CloseTrigger> =
		$props();
</script>

<ArkPopover.CloseTrigger aria-label="" data-slot="popover-close-trigger" {...props} bind:ref />
