<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.ValueText> = $props();
</script>

<ArkProgress.ValueText
	class={cn(
		'absolute bottom-0',
		'flex size-(--size) items-center justify-center',
		'text-xs font-medium tabular-nums',
		'pointer-events-none',
		className
	)}
	data-slot="circular-progress-value"
	{...rest}
	bind:ref
/>
