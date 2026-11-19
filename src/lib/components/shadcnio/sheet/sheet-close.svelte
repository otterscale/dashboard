<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';
	let { ref = $bindable(null), ...props }: ComponentProps<typeof ArkDialog.CloseTrigger> = $props();
</script>

<ArkDialog.CloseTrigger data-slot="sheet-close" {...props} bind:ref />
