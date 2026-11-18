<script lang="ts">
	import { Tooltip as ArkTooltip } from '@ark-ui/svelte/tooltip';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkTooltip.Trigger> = $props();
</script>

<ArkTooltip.Trigger data-slot="tooltip-trigger" {...props} bind:ref />
