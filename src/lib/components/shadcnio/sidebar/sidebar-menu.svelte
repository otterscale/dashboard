<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'ul'>>, 'as'> = $props();
</script>

<Ark
	as="ul"
	class={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
	data-sidebar="menu"
	data-slot="sidebar-menu"
	{...rest}
	bind:ref
/>
