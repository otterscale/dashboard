<script lang="ts">
	import { Progress as ArkProgress, useProgressContext } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Track> = $props();
	const progress = useProgressContext();
	const name = $derived(
		ariaLabel === undefined && ariaLabelledBy === undefined
			? { 'aria-labelledby': progress().getLabelProps().id }
			: { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }
	);
</script>

<ArkProgress.Track
	class={cn(
		'relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted',
		className
	)}
	data-slot="progress-track"
	{...name}
	{...rest}
	bind:ref
/>
