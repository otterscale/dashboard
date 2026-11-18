<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'span'>>, 'as'> = $props();
</script>

<Ark
	as="span"
	class={cn(
		'ms-auto text-xs tracking-widest text-muted-foreground group-hover/dropdown-menu-item:text-accent-foreground group-focus/dropdown-menu-item:text-accent-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground',
		className
	)}
	data-slot="menu-shortcut"
	{...rest}
	bind:ref
/>
