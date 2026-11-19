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
		'flex gap-4 py-2',
		'group-data-[orientation=horizontal]/data-list:flex-row group-data-[orientation=horizontal]/data-list:items-center',
		'group-data-[orientation=vertical]/data-list:flex-col group-data-[orientation=vertical]/data-list:gap-1',
		className
	)}
	data-slot="data-list-item"
	{...rest}
	bind:ref
/>
