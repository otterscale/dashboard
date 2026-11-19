<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import { _useDialog, dialogOverlayVariants } from './shared';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkDialog.Backdrop> = $props();
	const inPreview = false;
	const { modal } = _useDialog();
</script>

{#if !modal}{:else}<ArkDialog.Backdrop
		class={cn(dialogOverlayVariants(), inPreview && 'absolute!', className)}
		data-slot="dialog-overlay"
		{...rest}
		bind:ref
	/>{/if}
