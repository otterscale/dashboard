<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { ScrollArea } from '$lib/components/shadcnio/scroll-area/index.js';
	import { cn } from '$lib/utils';

	import type { DialogBodyProps } from './shared';
	let {
		scrollFade = false,
		class: className,
		ref = $bindable(null),
		...rest
	}: DialogBodyProps = $props();
</script>

<ScrollArea class="min-h-0 flex-1" {scrollFade}
	><Ark
		as="div"
		class={cn(
			'p-(--space)',
			'in-[[data-slot=dialog-content]:has([data-slot=dialog-header])]:pt-0',
			'in-[[data-slot=dialog-content]:has([data-slot=dialog-footer]:not(.border-t))]:pb-1',
			className
		)}
		data-slot="dialog-body"
		{...rest}
		bind:ref
	/></ScrollArea
>
