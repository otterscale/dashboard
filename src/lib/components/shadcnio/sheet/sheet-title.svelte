<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...props
	}: ComponentProps<typeof ArkDialog.Title> = $props();
</script>

<ArkDialog.Title
	class={cn('font-heading text-base font-medium text-foreground', className)}
	data-slot="sheet-title"
	{...props}
	bind:ref
/>
