<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...props
	}: ComponentProps<typeof ArkDialog.Description> = $props();
</script>

<ArkDialog.Description
	class={cn('text-sm text-muted-foreground', className)}
	data-slot="sheet-description"
	{...props}
	bind:ref
/>
