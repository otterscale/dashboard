<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { Button } from '$lib/components/shadcnio/button';
	import { cn } from '$lib/utils';

	import DialogClose from './dialog-close.svelte';
	import type { DialogFooterProps } from './shared';
	let {
		class: className,
		showCloseButton = false,
		children,
		ref = $bindable(null),
		...rest
	}: DialogFooterProps = $props();
</script>

<Ark
	as="div"
	class={cn(
		'-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
		className
	)}
	data-slot="dialog-footer"
	{...rest}
	bind:ref
	>{@render children?.()}{#if !!showCloseButton}<DialogClose
			>{#snippet asChild(props)}<Button {...props()} variant="outline">Close</Button
				>{/snippet}</DialogClose
		>{/if}</Ark
>
