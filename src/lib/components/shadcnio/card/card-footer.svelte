<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'div'>>, 'as'> = $props();
</script>

<Ark
	as="div"
	class={cn('flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)', className)}
	data-slot="card-footer"
	{...rest}
	bind:ref
/>
