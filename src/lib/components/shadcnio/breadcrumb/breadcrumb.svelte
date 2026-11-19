<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { cn } from '$lib/utils';

	import type { BreadcrumbProps } from './shared';
	let {
		'aria-label': ariaLabel = 'breadcrumb',
		class: className,
		ref = $bindable(null),
		...rest
	}: BreadcrumbProps = $props();
</script>

<Ark
	as="nav"
	aria-label={ariaLabel}
	class={cn('cn-breadcrumb', className)}
	data-slot="breadcrumb"
	{...rest}
	bind:ref
/>
