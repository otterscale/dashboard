<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { TableProps } from './shared';
	let {
		variant = 'plain',
		isHoverable = true,
		class: className,
		tabindex: tabIndex,
		ref = $bindable(null),
		...rest
	}: TableProps = $props();
	const region = $derived(
		tabIndex !== undefined && (rest['aria-label'] || rest['aria-labelledby'])
			? {
					'aria-label': rest['aria-label'],
					'aria-labelledby': rest['aria-labelledby'],
					role: 'region' as const
				}
			: {}
	);
</script>

<div
	class="relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
	data-slot="table-container"
	dir={rest.dir}
	tabindex={tabIndex}
	{...region}
>
	<Ark
		as="table"
		class={cn('group/table w-full caption-bottom text-sm', className)}
		data-hoverable={isHoverable ? 'true' : 'false'}
		data-slot="table"
		data-variant={variant}
		{...rest}
		bind:ref
	/>
</div>
