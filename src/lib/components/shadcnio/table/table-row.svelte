<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'tr'>>, 'as'> = $props();
</script>

<Ark
	as="tr"
	class={cn(
		'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
		'group-data-[hoverable=false]/table:hover:bg-transparent',
		'group-data-[variant=striped]/table:even:bg-muted/30',
		className
	)}
	data-slot="table-row"
	{...rest}
	bind:ref
/>
