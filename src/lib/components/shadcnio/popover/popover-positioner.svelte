<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkPopover.Positioner> = $props();
</script>

<ArkPopover.Positioner data-slot="popover-positioner" {...props} bind:ref />
