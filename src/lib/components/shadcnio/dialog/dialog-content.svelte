<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import { Portal } from '@ark-ui/svelte/portal';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/shadcnio/button';
	import { cn } from '$lib/utils';

	import DialogClose from './dialog-close.svelte';
	import DialogOverlay from './dialog-overlay.svelte';
	import DialogPositioner from './dialog-positioner.svelte';
	import { type DialogContentProps, dialogContentVariants } from './shared';
	let {
		showCloseButton = true,
		bottomStickOnMobile = true,
		positionerClassName,
		size = 'md',
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: DialogContentProps = $props();
</script>

<Portal
	><DialogOverlay /><DialogPositioner
		class={cn(
			bottomStickOnMobile && 'max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12',
			positionerClassName
		)}
		><ArkDialog.Content
			class={cn(dialogContentVariants({ bottomStickOnMobile, size }), className)}
			data-slot="dialog-content"
			{...rest}
			bind:ref
			>{@render children?.()}{#if !!showCloseButton}<DialogClose
					>{#snippet asChild(props)}<Button
							{...props({ class: 'absolute top-2 end-2 absolute!' })}
							size="icon-sm"
							variant="ghost"><XIcon aria-hidden="true" /><span class="sr-only">Close</span></Button
						>{/snippet}</DialogClose
				>{/if}</ArkDialog.Content
		></DialogPositioner
	></Portal
>
