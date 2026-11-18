<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'p'>>, 'as'> = $props();
</script>

<Ark
	as="p"
	class={cn('text-sm text-muted-foreground', className)}
	data-slot="card-description"
	{...rest}
	bind:ref
/>
