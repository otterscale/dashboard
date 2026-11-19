<script lang="ts">
	import { Collapsible as ArkCollapsible } from '@ark-ui/svelte/collapsible';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkCollapsible.Indicator> = $props();
</script>

<ArkCollapsible.Indicator
	class={cn('block data-[state=open]:[&_svg]:rotate-180', className)}
	data-slot="collapsible-indicator"
	{...rest}
	bind:ref
	>{#snippet asChild(props)}<span {...props()}
			>{#if children}{@render children?.()}{:else}<ChevronDownIcon
					aria-hidden="true"
					class="transition-transform duration-200 motion-reduce:transition-none!"
				/>{/if}</span
		>{/snippet}</ArkCollapsible.Indicator
>
