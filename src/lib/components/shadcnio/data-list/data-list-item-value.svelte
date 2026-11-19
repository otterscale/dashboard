<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'dd'>>, 'as'> = $props();
</script>

<Ark
	as="dd"
	class={cn('flex-1', 'text-foreground', className)}
	data-slot="data-list-item-value"
	{...rest}
	bind:ref
/>
