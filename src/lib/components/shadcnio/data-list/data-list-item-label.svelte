<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'dt'>>, 'as'> = $props();
</script>

<Ark
	as="dt"
	class={cn(
		'min-w-24 shrink-0',
		'font-medium text-muted-foreground',
		'group-data-[orientation=vertical]/data-list:min-w-0',
		className
	)}
	data-slot="data-list-item-label"
	{...rest}
	bind:ref
/>
