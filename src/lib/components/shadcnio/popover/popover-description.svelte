<script lang="ts">
	import { Popover as ArkPopover } from '@ark-ui/svelte/popover';
	import type { ComponentProps } from 'svelte';
	import { getContext, untrack } from 'svelte';

	import { cn } from '$lib/utils';

	import { PopoverLabelsContext_DEFAULT, PopoverLabelsContext_KEY } from './context-keys';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkPopover.Description> = $props();
	const labels =
		getContext<typeof PopoverLabelsContext_DEFAULT>(PopoverLabelsContext_KEY) ??
		PopoverLabelsContext_DEFAULT;
	$effect(() => {
		labels;
		return untrack(() => {
			labels?.setDescribed(true);
			return () => labels?.setDescribed(false);
		});
	});
</script>

<ArkPopover.Description
	class={cn('text-muted-foreground', className)}
	data-slot="popover-description"
	{...rest}
	bind:ref
/>
