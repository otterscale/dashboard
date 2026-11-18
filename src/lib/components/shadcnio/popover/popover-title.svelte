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
	}: ComponentProps<typeof ArkPopover.Title> = $props();
	const labels =
		getContext<typeof PopoverLabelsContext_DEFAULT>(PopoverLabelsContext_KEY) ??
		PopoverLabelsContext_DEFAULT;
	$effect(() => {
		labels;
		return untrack(() => {
			labels?.setLabelled(true);
			return () => labels?.setLabelled(false);
		});
	});
</script>

<ArkPopover.Title
	class={cn('font-medium', className)}
	data-slot="popover-title"
	{...rest}
	bind:ref
/>
