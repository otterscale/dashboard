<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { DataListProps } from './shared';
	let {
		orientation = 'horizontal',
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: DataListProps = $props();
</script>

<Ark
	as="dl"
	class={cn('group/data-list', 'flex flex-col gap-1', 'text-sm', className)}
	data-orientation={orientation}
	data-slot="data-list"
	{...rest}
	bind:ref>{@render children?.()}</Ark
>
