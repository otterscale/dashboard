<script lang="ts">
	import {
		SegmentGroup as ArkSegmentGroup,
		useSegmentGroupContext
	} from '@ark-ui/svelte/segment-group';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		'aria-label': ariaLabel,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkSegmentGroup.Item> = $props();
	const segmentGroup = useSegmentGroupContext();
	const checked = $derived(segmentGroup().value === rest.value);
</script>

<ArkSegmentGroup.Item
	class={cn(
		'relative',
		'cursor-pointer',
		'data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start',
		'rounded-[inherit] border border-transparent',
		'outline-none data-focus-visible:border-primary data-focus-visible:ring-[3px] data-focus-visible:ring-ring/32',
		'data-disabled:pointer-events-none data-disabled:opacity-64',
		className
	)}
	data-checked={checked || undefined}
	data-slot="segment-group-item"
	{...rest}
	bind:ref
	>{@render children?.()}<ArkSegmentGroup.ItemControl /><ArkSegmentGroup.ItemHiddenInput
		aria-label={ariaLabel}
		aria-labelledby={ariaLabel ? (null as unknown as string) : undefined}
	/></ArkSegmentGroup.Item
>
