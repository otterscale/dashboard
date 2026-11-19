<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { Component, Snippet } from 'svelte';

	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { cn } from '$lib/utils';

	// A small icon button that explains something on hover and on keyboard focus.
	let {
		text,
		label,
		icon: Icon = InfoIcon,
		class: className,
		children
	}: {
		text?: string;
		/** Accessible name of the button. Defaults to the text. */
		label?: string;
		icon?: Component;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<Tooltip>
	<TooltipTrigger>
		{#snippet asChild(props)}
			<button
				{...props({
					type: 'button',
					'aria-label': label ?? text,
					class: cn(
						'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
						className
					)
				})}
			>
				<Icon class="size-3.5" />
			</button>
		{/snippet}
	</TooltipTrigger>
	<TooltipContent class="max-w-xs text-pretty">
		{#if children}{@render children()}{:else}{text}{/if}
	</TooltipContent>
</Tooltip>
