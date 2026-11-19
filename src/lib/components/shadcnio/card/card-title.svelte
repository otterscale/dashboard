<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'h2'>>, 'as'> = $props();
</script>

<Ark
	as="h2"
	class={cn(
		'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
		className
	)}
	data-slot="card-title"
	{...rest}
	bind:ref
/>
