<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.Label> = $props();
</script>

<ArkProgress.Label
	class={cn('text-sm font-medium', className)}
	data-slot="progress-label"
	{...rest}
	bind:ref
/>
