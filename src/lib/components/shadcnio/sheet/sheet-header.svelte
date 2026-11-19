<script lang="ts">
	import { cn } from '$lib/utils';

	import type { SheetHeaderProps } from './shared';
	import SheetDescription from './sheet-description.svelte';
	import SheetTitle from './sheet-title.svelte';
	let { class: className, title, description, children, ...rest }: SheetHeaderProps = $props();
</script>

<div class={cn('flex flex-col gap-0.5 p-4', className)} data-slot="sheet-header" {...rest}>
	{#if !!title}<SheetTitle>{title}</SheetTitle>{/if}{#if !!description}<SheetDescription
			>{description}</SheetDescription
		>{/if}{@render children?.()}
</div>
