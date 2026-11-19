<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { ScrollArea } from '$lib/components/shadcnio/scroll-area';
	import { cn } from '$lib/utils';

	import type { SidebarContentProps } from './shared';
	let { scrollFade = false, class: className, ...rest }: SidebarContentProps = $props();
</script>

<ScrollArea class="h-auto min-h-0 w-full flex-1 [--fade-size:3rem]" {scrollFade}
	><Ark
		as="div"
		class={cn(
			'no-scrollbar flex min-h-0 flex-1 flex-col gap-0',
			'in-data-[collapsible=icon]:overflow-hidden',
			className
		)}
		data-sidebar="content"
		data-slot="sidebar-content"
		{...rest}
	/></ScrollArea
>
