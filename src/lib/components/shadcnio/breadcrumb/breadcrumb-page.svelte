<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'span'>>, 'as'> = $props();
</script>

<Ark
	as="span"
	aria-current="page"
	aria-disabled="true"
	class={cn('font-normal text-foreground', className)}
	data-slot="breadcrumb-page"
	role="link"
	{...rest}
	bind:ref
/>
