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
		'size-10 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none',
		className
	)}
	data-slot="skeleton-circle"
	{...rest}
	bind:ref
/>
