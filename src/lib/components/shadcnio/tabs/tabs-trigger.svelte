<script lang="ts">
	import { Tabs as ArkTabs } from '@ark-ui/svelte/tabs';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkTabs.Trigger> = $props();
</script>

<ArkTabs.Trigger
	class={cn(
		"relative z-1 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/70 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pe-1 has-data-[icon=inline-start]:ps-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[selected]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-[selected]:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		// Until zag measures the indicator (`data-ssr`, before hydration), the
		// selected trigger draws it: the fill in the default list, the line
		// in the line list, where the indicator will be. That is the bottom
		// edge of the list, 3.5px below the trigger (the list padding, plus
		// the half pixel the trigger is short of it) and 1px more for the
		// trigger border; in a vertical list, the left edge of the trigger,
		// as zag places it.
		'group-data-[variant=default]/tabs-list:data-[ssr]:data-[selected]:bg-accent',
		'group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:after:absolute group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:after:bg-foreground',
		'group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=horizontal]:after:-inset-x-px group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=horizontal]:after:-bottom-[4.5px] group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=horizontal]:after:h-0.5',
		'group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=vertical]:after:-inset-y-px group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=vertical]:after:-left-px group-data-[variant=line]/tabs-list:data-[ssr]:data-[selected]:data-[orientation=vertical]:after:w-0.5',
		className
	)}
	data-slot="tabs-trigger"
	{...rest}
	bind:ref
/>
