<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import DialogModalContext from './dialog-modal-context.svelte';
	let {
		lazyMount = true,
		unmountOnExit = true,
		...rest
	}: ComponentProps<typeof ArkDialog.RootProvider> = $props();
</script>

<DialogModalContext value={{ modal: true }}
	><ArkDialog.RootProvider {lazyMount} {unmountOnExit} {...rest} /></DialogModalContext
>
