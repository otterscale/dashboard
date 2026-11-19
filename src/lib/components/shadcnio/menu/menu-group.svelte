<script lang="ts">
	import { Menu as ArkMenu } from '@ark-ui/svelte/menu';

	import MenuGroupLabel from './menu-group-label.svelte';
	import type { MenuGroupProps } from './shared';
	let { heading, children, ref = $bindable(null), ...rest }: MenuGroupProps = $props();
</script>

<ArkMenu.ItemGroup data-slot="menu-group" {...rest} bind:ref
	>{#if !!heading}<MenuGroupLabel>{heading}</MenuGroupLabel
		>{/if}{@render children?.()}</ArkMenu.ItemGroup
>
