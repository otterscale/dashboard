<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';

	import MenuGroupLabel from './menu-group-label.svelte';
	import type { MenuRadioGroupProps } from './shared';
	let { heading, children, ref = $bindable(null), ...rest }: MenuRadioGroupProps = $props();
</script>

<ArkMenu.RadioItemGroup data-slot="menu-radio-group" {...rest} bind:ref
	>{#if !!heading}<MenuGroupLabel>{heading}</MenuGroupLabel
		>{/if}{@render children?.()}</ArkMenu.RadioItemGroup
>
