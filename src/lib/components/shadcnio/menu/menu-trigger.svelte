<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkMenu.Trigger> = $props();
</script>

<ArkMenu.Trigger data-slot="menu-trigger" {...props} bind:ref />
