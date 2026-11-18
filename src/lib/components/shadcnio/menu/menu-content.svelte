<script lang="ts">
	import { Menu as ArkMenu, type MenuContentProps } from '@ark-ui/svelte/menu';
	import { Portal } from '@ark-ui/svelte/portal';

	import { cn } from '$lib/utils';

	import MenuPositioner from './menu-positioner.svelte';
	let { class: className, children, ...rest }: MenuContentProps = $props();
</script>

<Portal
	><MenuPositioner
		><ArkMenu.Content
			class={cn(
				'z-50 max-h-(--available-height) max-w-[calc(100vw-2rem)] min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className
			)}
			data-slot="menu-content"
			{...rest}>{@render children?.()}</ArkMenu.Content
		></MenuPositioner
	></Portal
>
