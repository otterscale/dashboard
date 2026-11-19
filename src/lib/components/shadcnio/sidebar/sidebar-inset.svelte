<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import { SIDEBAR_PANEL_MOTION } from './shared';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'main'>>, 'as'> = $props();
</script>

<Ark
	as="main"
	class={cn(
		'relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2',
		'transition-[margin]',
		SIDEBAR_PANEL_MOTION,
		'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0',
		'md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2',
		'md:peer-data-[variant=inset]:overflow-hidden md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm',
		className
	)}
	data-slot="sidebar-inset"
	{...rest}
	bind:ref
/>
