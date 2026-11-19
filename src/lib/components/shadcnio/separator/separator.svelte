<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { SeparatorProps } from './shared';
	let {
		orientation = 'horizontal',
		class: className,
		ref = $bindable(null),
		...rest
	}: SeparatorProps = $props();
</script>

<Ark
	as="div"
	aria-orientation={orientation}
	class={cn(
		'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
		orientation === 'horizontal' && 'h-px w-full',
		orientation === 'vertical' && 'h-full w-px',
		className
	)}
	data-orientation={orientation}
	data-slot="separator"
	role="separator"
	{...rest}
	bind:ref
/>
