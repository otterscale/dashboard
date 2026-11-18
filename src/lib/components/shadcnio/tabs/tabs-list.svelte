<script lang="ts">
	import { Tabs as ArkTabs } from '@ark-ui/svelte/tabs';

	import { cn } from '$lib/utils';

	import { listVariant, type TabsListProps, tabsListVariants } from './shared';
	let {
		variant = 'default',
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: TabsListProps = $props();
	const { base, indicator } = $derived(
		tabsListVariants({
			variant: listVariant(variant)
		})
	);
</script>

<ArkTabs.List
	class={cn(base(), className)}
	data-slot="tabs-list"
	data-variant={listVariant(variant)}
	{...rest}
	bind:ref
	>{@render children?.()}<ArkTabs.Indicator
		class={cn(indicator())}
		data-slot="tab-indicator"
	/></ArkTabs.List
>
