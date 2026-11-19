<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkDialog.Description> = $props();
</script>

<ArkDialog.Description
	class={cn(
		'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
		className
	)}
	data-slot="dialog-description"
	{...rest}
	bind:ref
/>
