<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import { type AlertProps, alertVariants } from './shared';
	let {
		variant,
		class: className,
		role = 'alert',
		ref = $bindable(null),
		...rest
	}: AlertProps = $props();
</script>

<Ark
	as="div"
	class={cn(alertVariants({ variant }), className)}
	data-slot="alert"
	data-variant={variant ?? 'default'}
	{role}
	{...rest}
	bind:ref
/>
