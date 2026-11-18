<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import ProgressIndicator from './progress-indicator.svelte';
	import ProgressTrack from './progress-track.svelte';
	import { clampValue } from './shared';
	let {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		class: className,
		children,
		defaultValue,
		max,
		min,
		value,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Root> = $props();
</script>

<ArkProgress.Root
	class={cn('cn-progress-root flex flex-wrap gap-3', className)}
	data-slot="progress"
	defaultValue={clampValue(defaultValue, min, max)}
	{max}
	{min}
	value={clampValue(value, min, max)}
	{...rest}
	bind:ref
	>{@render children?.()}<ProgressTrack aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}
		><ProgressIndicator /></ProgressTrack
	></ArkProgress.Root
>
