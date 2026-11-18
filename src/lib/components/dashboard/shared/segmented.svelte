<script lang="ts" generics="T extends string">
	import {
		SegmentGroup,
		SegmentGroupItem,
		SegmentGroupItemText
	} from '$lib/components/shadcnio/segment-group';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(),
		options,
		'aria-label': ariaLabel,
		class: className
	}: {
		value: T;
		options: { value: T; label: string }[];
		'aria-label': string;
		class?: string;
	} = $props();
</script>

<!-- A switch between two or three views of the same thing: a white pill on a tinted track. -->
<SegmentGroup
	aria-label={ariaLabel}
	{value}
	onValueChange={(details) => {
		if (details.value) value = details.value as T;
	}}
	class={cn(
		'w-fit gap-0 rounded-lg bg-muted p-0.5',
		'*:data-[slot=segment-group-indicator]:rounded-md *:data-[slot=segment-group-indicator]:bg-background *:data-[slot=segment-group-indicator]:shadow-xs',
		'dark:*:data-[slot=segment-group-indicator]:bg-foreground/15',
		className
	)}
>
	{#each options as option (option.value)}
		<SegmentGroupItem
			value={option.value}
			class="flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium text-muted-foreground data-checked:text-foreground"
		>
			<SegmentGroupItemText>{option.label}</SegmentGroupItemText>
		</SegmentGroupItem>
	{/each}
</SegmentGroup>
