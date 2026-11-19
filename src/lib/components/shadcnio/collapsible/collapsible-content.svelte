<script lang="ts">
	import { Collapsible as ArkCollapsible } from '@ark-ui/svelte/collapsible';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		disableAnimation = false,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkCollapsible.Content> & {
		/** Opens and closes it at once, without the height animation. */
		disableAnimation?: boolean;
	} = $props();
</script>

<ArkCollapsible.Content
	class={cn(
		'h-(--collapsed-height) overflow-hidden',
		'group-data-partial-collapse/collapsible:h-full',
		disableAnimation
			? 'transition-none data-[state=closed]:animate-none data-[state=open]:animate-none'
			: [
					'data-[state=open]:animate-expand',
					'data-[state=closed]:animate-collapse',
					'motion-reduce:animate-none!'
				],
		className
	)}
	data-slot="collapsible-content"
	{...rest}
	bind:ref
/>
