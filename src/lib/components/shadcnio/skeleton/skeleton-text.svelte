<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { SkeletonTextProps } from './shared';
	let { class: className, lines = 2, ref = $bindable(null), ...rest }: SkeletonTextProps = $props();
</script>

<Ark
	as="div"
	class={cn('flex w-full flex-col gap-2', className)}
	data-slot="skeleton-text"
	{...rest}
	bind:ref
	>{#each Array.from( { length: lines } ) as _, index (`skeleton-text-${index}`)}{@const key = `skeleton-text-${index}`}
		<div
			class="h-4 w-full animate-pulse rounded-md bg-muted last:w-3/4 motion-reduce:animate-none"
		></div>{/each}</Ark
>
