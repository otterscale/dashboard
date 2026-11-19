<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import type { ComponentProps } from 'svelte';

	import { LocaleProvider } from '$lib/components/shadcnio/locale';
	let {
		dir,
		lazyMount = true,
		positioning,
		unmountOnExit = true,
		...rest
	}: ComponentProps<typeof ArkMenu.Root> & {
		dir?: 'ltr' | 'rtl';
	} = $props();
	const boundary = undefined;
</script>

{#snippet root()}<ArkMenu.Root
		{lazyMount}
		positioning={{
			placement: 'bottom-end',
			...positioning,
			...(boundary ? { boundary, overflowPadding: 8 } : {})
		}}
		{unmountOnExit}
		{...rest}
	/>{/snippet}
{#if dir === 'rtl'}<LocaleProvider locale="ar">{@render root()}</LocaleProvider
	>{:else}{@render root()}{/if}
