<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import Menu from './menu.svelte';
	let props: ComponentProps<typeof Menu> = $props();
</script>

<Menu {...props} />
