<script lang="ts">
	import { SegmentGroup as ArkSegmentGroup } from '@ark-ui/svelte/segment-group';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkSegmentGroup.Indicator> = $props();
</script>

<ArkSegmentGroup.Indicator
	class={cn(
		'absolute top-(--top) left-(--left) z-0',
		'h-(--height) w-(--width)',
		'rounded-[inherit]',
		'bg-input',
		// A disabled group dims its items and this, not itself, so an item
		// isn't dimmed twice.
		'data-disabled:opacity-64',
		'transition-[width,height,left,top] duration-150 ease-out',
		'[transition-property:var(--transition-property,width,height,left,top)]',
		'group-data-[variant=underline]/segment-group:bg-primary',
		'data-[orientation=horizontal]:group-data-[variant=underline]/segment-group:top-[calc(var(--top)+var(--height)-1px)]',
		'data-[orientation=vertical]:group-data-[variant=underline]/segment-group:right-[calc(var(--left)+var(--width)-1px)]',
		'data-[orientation=vertical]:group-data-[variant=underline]/segment-group:-translate-x-px',
		'data-[orientation=horizontal]:group-data-[variant=underline]/segment-group:h-0.5',
		'data-[orientation=vertical]:group-data-[variant=underline]/segment-group:w-0.5',
		'motion-reduce:transition-none!',
		className
	)}
	data-slot="segment-group-indicator"
	{...rest}
	bind:ref
/>
