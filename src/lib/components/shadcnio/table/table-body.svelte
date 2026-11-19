<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'tbody'>>, 'as'> = $props();
</script>

<Ark
	as="tbody"
	class={cn('[&_tr:last-child]:border-0', className)}
	data-slot="table-body"
	{...rest}
	bind:ref
/>
