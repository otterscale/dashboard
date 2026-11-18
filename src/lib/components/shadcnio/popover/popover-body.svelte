<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { ScrollArea } from '$lib/components/shadcnio/scroll-area/index.js';
	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
</script>

<ScrollArea
	><Ark
		as="div"
		class={cn(
			'flex-1',
			'p-(--space)',
			'overflow-auto',
			'in-[[data-slot=popover-content]:has([data-slot=popover-header])]:pt-1',
			'in-[[data-slot=popover-content]:has([data-slot=popover-footer]:not(.border-t))]:pb-1',
			className
		)}
		data-slot="popover-body"
		{...rest}
		bind:ref
	/></ScrollArea
>
