<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkDialog.Trigger> = $props();
</script>

<ArkDialog.Trigger data-slot="sheet-trigger" {...props} bind:ref />
