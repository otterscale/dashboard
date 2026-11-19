<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { buttonVariants } from '$lib/components/shadcnio/button';
	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'button'>>, 'as'> = $props();
</script>

<Ark
	as="button"
	class={cn(
		buttonVariants({
			clickEffect: false,
			size: 'icon-xs',
			variant: 'ghost'
		}),
		'absolute inset-e-3 top-3.5 w-5 rounded-md p-0 text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4',
		'text-sidebar-foreground',
		'transition-none!',
		'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
		'[&_svg]:size-4 [&_svg]:shrink-0',
		'after:absolute after:-inset-2 md:after:hidden',
		'in-data-[collapsible=icon]:hidden',
		className
	)}
	data-sidebar="group-action"
	data-slot="sidebar-group-action"
	type="button"
	{...rest}
	bind:ref
/>
