<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkDialog.Backdrop> = $props();
</script>

<ArkDialog.Backdrop
	class={cn('fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs', className)}
	data-slot="sheet-overlay"
	{...rest}
	bind:ref
/>
