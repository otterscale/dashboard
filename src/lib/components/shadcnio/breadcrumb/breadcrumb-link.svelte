<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'a'>>, 'as'> = $props();
</script>

<Ark
	as="a"
	class={cn('transition-colors hover:text-foreground', className)}
	data-slot="breadcrumb-link"
	{...rest}
	bind:ref
/>
