<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import { type BadgeProps, badgeVariants } from './shared';
	let {
		variant = 'default',
		size = 'md',
		pill = false,
		class: className,
		ref = $bindable(null),
		...rest
	}: BadgeProps = $props();
</script>

<Ark
	as="span"
	class={cn(badgeVariants({ pill, size, variant }), className)}
	data-pill={pill || undefined}
	data-size={size}
	data-slot="badge"
	data-variant={variant}
	{...rest}
	bind:ref
/>
