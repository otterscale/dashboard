<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'td'>>, 'as'> = $props();
</script>

<Ark
	as="td"
	class={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0', className)}
	data-slot="table-cell"
	{...rest}
	bind:ref
/>
