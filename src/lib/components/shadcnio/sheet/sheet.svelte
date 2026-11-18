<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import { Dialog } from '$lib/components/shadcnio/dialog/index.js';
	let props: ComponentProps<typeof Dialog> = $props();
</script>

<Dialog {...props} />
