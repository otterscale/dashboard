<script lang="ts">
	import { SegmentGroup as ArkSegmentGroup } from '@ark-ui/svelte/segment-group';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkSegmentGroup.ItemText> = $props();
</script>

<ArkSegmentGroup.ItemText
	class={cn('relative z-1', className)}
	data-slot="segment-group-item-text"
	{...rest}
	bind:ref
/>
