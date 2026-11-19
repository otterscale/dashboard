<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars -- registry code, kept as shipped */
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { SidebarProps } from './shared';
	let {
		class: className,
		children,
		collapsible: _collapsible,
		placement: _placement,
		variant: _variant,
		...rest
	}: SidebarProps = $props();
</script>

<Ark
	as="div"
	class={cn(
		'flex h-full w-(--sidebar-width) shrink-0 flex-col',
		'bg-sidebar text-sidebar-foreground',
		className
	)}
	data-slot="sidebar"
	{...rest}>{@render children?.()}</Ark
>
