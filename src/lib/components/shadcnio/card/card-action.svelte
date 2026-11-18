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
		'cn-card-action col-start-2 row-span-2 row-start-1 self-start justify-self-end',
		className
	)}
	data-slot="card-action"
	{...rest}
	bind:ref
/>
