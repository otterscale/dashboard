<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'thead'>>, 'as'> = $props();
</script>

<Ark
	as="thead"
	class={cn('[&_tr]:border-b', className)}
	data-slot="table-header"
	{...rest}
	bind:ref
/>
