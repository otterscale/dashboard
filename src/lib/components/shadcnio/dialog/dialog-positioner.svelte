<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkDialog.Positioner> = $props();
	const inPreview = false;
</script>

<ArkDialog.Positioner
	class={cn(
		'z-50 grid grid-rows-[1fr_auto_1fr] justify-items-center p-4',
		inPreview ? 'absolute inset-0 h-full w-full' : 'fixed inset-0 h-svh w-screen',
		className
	)}
	data-slot="dialog-positioner"
	{...rest}
	bind:ref
/>
