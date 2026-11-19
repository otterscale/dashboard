<script lang="ts">
	import type { SidebarProps } from './shared';
	import SidebarCollapsible from './sidebar-collapsible.svelte';
	import SidebarStatic from './sidebar-static.svelte';
	let props: SidebarProps = $props();
</script>

{#if props.collapsible === 'none'}<SidebarStatic {...props} />{:else}<SidebarCollapsible
		{...props}
	/>{/if}
