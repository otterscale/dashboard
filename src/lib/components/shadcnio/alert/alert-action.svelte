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
	class={cn('absolute end-2 top-2', className)}
	data-slot="alert-action"
	{...rest}
	bind:ref
/>
