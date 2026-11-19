<script lang="ts">
	import { SegmentGroup as ArkSegmentGroup } from '@ark-ui/svelte/segment-group';

	import { cn } from '$lib/utils';

	import SegmentGroupIndicator from './segment-group-indicator.svelte';
	import type { SegmentGroupProps } from './shared';
	let {
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		orientation = 'horizontal',
		variant = 'default',
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: SegmentGroupProps = $props();
</script>

<ArkSegmentGroup.Root
	aria-label={ariaLabel}
	aria-labelledby={ariaLabelledBy ?? (ariaLabel ? (null as unknown as string) : undefined)}
	class={cn(
		'group/segment-group relative',
		'flex gap-2',
		'isolate',
		'data-[orientation=vertical]:flex-col',
		'data-[variant=underline]:gap-1 data-[variant=underline]:border-input',
		'data-[orientation=horizontal]:data-[variant=underline]:border-b',
		'data-[orientation=vertical]:data-[variant=underline]:border-l',
		className
	)}
	data-slot="segment-group"
	data-variant={variant}
	{orientation}
	{...rest}
	bind:ref><SegmentGroupIndicator />{@render children?.()}</ArkSegmentGroup.Root
>
