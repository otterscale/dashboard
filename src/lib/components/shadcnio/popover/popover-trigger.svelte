<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkPopover.Trigger> = $props();
</script>

<ArkPopover.Trigger data-slot="popover-trigger" {...props} bind:ref />
