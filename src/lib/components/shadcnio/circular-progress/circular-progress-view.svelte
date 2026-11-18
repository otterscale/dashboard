<script lang="ts">
	import { Progress as ArkProgress } from '@ark-ui/svelte/progress';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkProgress.View> = $props();
</script>

<ArkProgress.View
	class={cn('text-sm text-muted-foreground', className)}
	data-slot="circular-progress-view"
	{...rest}
	bind:ref
/>
