<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Range> = $props();
</script>

<ArkProgress.Range
	class={cn(
		'h-full bg-primary transition-all',
		// With no value, zag gives the range no width. A full, pulsing fill
		// reads as neither empty nor done. The pulse is a fade, not movement,
		// and the only thing telling this state from a full bar, so it keeps
		// running under reduced motion.
		'data-[state=indeterminate]:w-full data-[state=indeterminate]:animate-pulse',
		className
	)}
	data-slot="progress-indicator"
	{...rest}
	bind:ref
/>
