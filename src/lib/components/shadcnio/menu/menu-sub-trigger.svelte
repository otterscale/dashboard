<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkMenu.TriggerItem> = $props();
</script>

<ArkMenu.TriggerItem
	class={cn(
		"flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground not-data-[variant=destructive]:hover:**:text-accent-foreground focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:ps-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	data-slot="menu-sub-trigger"
	{...rest}
	bind:ref
	>{@render children?.()}<ChevronRight
		class="cn-rtl-flip ms-auto rtl:rotate-180"
	/></ArkMenu.TriggerItem
>
