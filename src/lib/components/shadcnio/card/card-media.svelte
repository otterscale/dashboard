<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import { type CardMediaProps, cardMediaVariants } from './shared';
	let {
		variant = 'default',
		class: className,
		ref = $bindable(null),
		...rest
	}: CardMediaProps = $props();
</script>

<Ark
	as="div"
	class={cn(cardMediaVariants({ variant }), className)}
	data-slot="card-media"
	data-variant={variant}
	{...rest}
	bind:ref
/>
