<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	import DialogDescription from './dialog-description.svelte';
	import DialogTitle from './dialog-title.svelte';
	import type { DialogHeaderProps } from './shared';
	let {
		class: className,
		title,
		description,
		children,
		ref = $bindable(null),
		...rest
	}: Omit<DialogHeaderProps, 'children'> & { children?: Snippet | string } = $props();
</script>

<Ark
	as="div"
	class={cn('flex flex-col gap-2', className)}
	data-slot="dialog-header"
	{...rest}
	bind:ref
	>{#if !!title}<DialogTitle>{title}</DialogTitle>{/if}{#if !!description}<DialogDescription
			>{description}</DialogDescription
		>{/if}{#if !title && typeof children === 'string'}<DialogTitle>{children}</DialogTitle
		>{:else}{#if typeof children === 'function'}{@render children()}{:else}{children}{/if}{/if}</Ark
>
