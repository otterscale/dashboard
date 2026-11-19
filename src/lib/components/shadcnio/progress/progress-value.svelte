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
	class={cn('ms-auto text-sm text-muted-foreground tabular-nums', className)}
	data-slot="progress-value"
	{...rest}
	bind:ref
/>
