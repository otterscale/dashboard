<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import { DialogBody } from '$lib/components/shadcnio/dialog/index.js';
	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof DialogBody> = $props();
</script>

<DialogBody
	class={cn('in-[[data-slot=sheet-content]:has([data-slot=sheet-header])]:pt-0', className)}
	data-slot="sheet-body"
	{...rest}
	bind:ref
/>
