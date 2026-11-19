<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkDialog.Title> = $props();
</script>

<ArkDialog.Title
	class={cn('font-heading text-base leading-none font-medium', className)}
	data-slot="dialog-title"
	{...rest}
	bind:ref
/>
