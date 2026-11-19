<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import DialogModalContext from './dialog-modal-context.svelte';
	let {
		modal = true,
		lazyMount = true,
		unmountOnExit = true,
		preventScroll,
		...rest
	}: ComponentProps<typeof ArkDialog.Root> = $props();
	const inPreview = false;
</script>

<DialogModalContext value={{ modal }}
	><ArkDialog.Root
		{lazyMount}
		{modal}
		preventScroll={preventScroll ?? (inPreview ? false : modal)}
		{unmountOnExit}
		{...rest}
	/></DialogModalContext
>
