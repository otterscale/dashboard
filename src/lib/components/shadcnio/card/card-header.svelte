<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	import CardDescription from './card-description.svelte';
	import CardTitle from './card-title.svelte';
	import type { CardHeaderProps } from './shared';
	let {
		title,
		description,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: Omit<CardHeaderProps, 'children'> & { children?: Snippet | string } = $props();
</script>

<Ark
	as="div"
	class={cn(
		'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
		className
	)}
	data-slot="card-header"
	{...rest}
	bind:ref
	>{#if !!title}<CardTitle>{title}</CardTitle
		>{/if}{#if !title && typeof children === 'string'}<CardTitle>{children}</CardTitle
		>{:else}{/if}{#if !!description}<CardDescription>{description}</CardDescription
		>{/if}{#if !title && typeof children === 'string'}{:else}{#if typeof children === 'function'}{@render children()}{:else}{children}{/if}{/if}</Ark
>
