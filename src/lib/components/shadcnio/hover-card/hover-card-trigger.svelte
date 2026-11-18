<script lang="ts">
	import { HoverCard as ArkHoverCard } from '@ark-ui/svelte/hover-card';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkHoverCard.Trigger> = $props();
</script>

<ArkHoverCard.Trigger data-slot="hover-card-trigger" {...props} bind:ref />
