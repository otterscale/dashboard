<script lang="ts">
	import { FieldInput } from '@ark-ui/svelte/field';

	import { cn } from '$lib/utils';

	import { type InputProps, inputVariants } from './shared';
	let {
		size = 'md',
		type = 'text',
		class: className,
		ref = $bindable(null),
		...rest
	}: InputProps = $props();
</script>

<FieldInput
	class={cn(inputVariants({ size }), className)}
	data-size={size}
	data-slot="input"
	{type}
	{...rest}
	bind:ref
/>
