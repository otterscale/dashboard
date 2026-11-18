<script lang="ts">
	import { HoverCard as ArkHoverCard } from '@ark-ui/svelte/hover-card';

	import type { HoverCardProps } from './shared';
	let {
		lazyMount = true,
		unmountOnExit = true,
		closeDelay = 100,
		openDelay = 10,
		positioning = { placement: 'bottom' },
		...rest
	}: HoverCardProps = $props();
</script>

<ArkHoverCard.Root {closeDelay} {lazyMount} {openDelay} {positioning} {unmountOnExit} {...rest} />
