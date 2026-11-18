<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkMenu.CheckboxItem> = $props();
</script>

<ArkMenu.CheckboxItem
	class={cn(
		"relative flex cursor-pointer items-center gap-1.5 rounded-md py-1 ps-1.5 pe-8 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:ps-7 data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...rest}
	bind:ref
	><ArkMenu.ItemIndicator
		class="pointer-events-none absolute end-2 flex items-center justify-center"
		><CheckIcon /></ArkMenu.ItemIndicator
	><ArkMenu.ItemText class="contents">{@render children?.()}</ArkMenu.ItemText
	></ArkMenu.CheckboxItem
>
