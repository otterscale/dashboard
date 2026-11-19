<script lang="ts">
	import type { TooltipProviderProps } from './shared';
	import TooltipProviderContext from './tooltip-provider-context.svelte';
	let { children, closeDelay = 100, delay = 0 }: TooltipProviderProps = $props();
</script>

<TooltipProviderContext value={{ closeDelay, openDelay: delay }}
	>{@render children?.()}</TooltipProviderContext
>
