<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'ol'>>, 'as'> = $props();
</script>

<Ark
	as="ol"
	class={cn(
		'flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground',
		className
	)}
	data-slot="breadcrumb-list"
	{...rest}
	bind:ref
/>
