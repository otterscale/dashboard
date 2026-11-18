<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	import PopoverDescription from './popover-description.svelte';
	import PopoverTitle from './popover-title.svelte';
	import type { PopoverHeaderProps } from './shared';
	let {
		title,
		description,
		children,
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<PopoverHeaderProps, 'children'> & { children?: Snippet | string } = $props();
</script>

<Ark
	as="div"
	class={cn('flex flex-col gap-0.5 text-sm', className)}
	data-slot="popover-header"
	{...rest}
	bind:ref
	>{#if !!title}<PopoverTitle>{title}</PopoverTitle>{/if}{#if !!description}<PopoverDescription
			>{description}</PopoverDescription
		>{/if}{#if !title && typeof children === 'string'}<PopoverTitle>{children}</PopoverTitle
		>{:else}{#if typeof children === 'function'}{@render children()}{:else}{children}{/if}{/if}</Ark
>
