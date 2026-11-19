<script lang="ts">
	import { Tooltip as ArkTooltip } from '@ark-ui/svelte/tooltip';
	import type { ComponentProps } from 'svelte';
	import { getContext } from 'svelte';

	import { TooltipProviderContext_DEFAULT, TooltipProviderContext_KEY } from './context-keys';
	const provider =
		getContext<typeof TooltipProviderContext_DEFAULT>(TooltipProviderContext_KEY) ??
		TooltipProviderContext_DEFAULT;
	let {
		positioning,
		lazyMount = true,
		unmountOnExit = true,
		closeDelay = provider.closeDelay,
		openDelay = provider.openDelay,
		...rest
	}: ComponentProps<typeof ArkTooltip.Root> = $props();
</script>

<ArkTooltip.Root
	{closeDelay}
	{lazyMount}
	{openDelay}
	positioning={{ gutter: 4, placement: 'top', ...positioning }}
	{unmountOnExit}
	{...rest}
/>
