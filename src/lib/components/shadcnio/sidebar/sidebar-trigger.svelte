<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import type { ComponentProps } from 'svelte';

	import { Button } from '$lib/components/shadcnio/button/index.js';
	import { cn } from '$lib/utils';

	import { useSidebar } from './shared';
	import Sidebar from './sidebar.svelte';
	let {
		class: className,
		onclick: onClick,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof Button> = $props();
	const __useSidebar1 = useSidebar();
	const { toggleSidebar } = $derived(__useSidebar1);
	const handleClick = (event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) => {
		onClick?.(event);
		toggleSidebar();
	};
</script>

<Button
	class={cn('cn-sidebar-trigger size-7 transition-none!', className)}
	clickEffect={false}
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	onclick={handleClick}
	size="icon-md"
	variant="ghost"
	{...rest}
	bind:ref
	><PanelLeftIcon class="cn-rtl-flip rtl:rotate-180" /><Ark as="span" class="sr-only"
		>Toggle Sidebar</Ark
	></Button
>
