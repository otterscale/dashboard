<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		size = 'default',
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> & {
		size?: 'default' | 'sm';
	} = $props();
</script>

<Ark
	as="div"
	class={cn(
		'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
		className
	)}
	data-size={size}
	data-slot="card"
	{...rest}
	bind:ref
/>
