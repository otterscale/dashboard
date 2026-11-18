<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
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
	aria-hidden="true"
	class={cn('flex size-5 items-center justify-center [&>svg]:size-4', className)}
	data-slot="breadcrumb-ellipsis"
	role="presentation"
	{...rest}
	bind:ref><MoreHorizontalIcon /><span class="sr-only">More</span></Ark
>
