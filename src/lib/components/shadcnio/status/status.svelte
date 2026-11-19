<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import { type StatusProps, statusVariants } from './shared';
	let {
		variant,
		size = 'md',
		class: className,
		ref = $bindable(null),
		...rest
	}: StatusProps = $props();
</script>

<Ark
	as="span"
	aria-hidden="true"
	class={cn(statusVariants({ size, variant }), className)}
	data-size={size}
	data-slot="status-indicator"
	{...rest}
	bind:ref
/>
