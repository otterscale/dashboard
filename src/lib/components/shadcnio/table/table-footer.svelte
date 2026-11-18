<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'tfoot'>>, 'as'> = $props();
</script>

<Ark
	as="tfoot"
	class={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
	data-slot="table-footer"
	{...rest}
	bind:ref
/>
