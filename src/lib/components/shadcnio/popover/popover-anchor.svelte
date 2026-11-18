<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkPopover.Anchor> = $props();
</script>

<ArkPopover.Anchor data-slot="popover-anchor" {...props} bind:ref />
