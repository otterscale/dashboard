<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'caption'>>, 'as'> = $props();
</script>

<Ark
	as="caption"
	class={cn('mt-4 text-sm text-muted-foreground', className)}
	data-slot="table-caption"
	{...rest}
	bind:ref
/>
