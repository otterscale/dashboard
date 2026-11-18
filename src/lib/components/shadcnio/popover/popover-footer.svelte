<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
</script>

<Ark
	as="div"
	class={cn(
		'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
		'sm:rounded-b-[calc(var(--radius-lg)-1px)]',
		'px-(--space) py-4',
		'bg-muted/64',
		'border-t',
		className
	)}
	data-slot="popover-footer"
	{...rest}
	bind:ref
/>
