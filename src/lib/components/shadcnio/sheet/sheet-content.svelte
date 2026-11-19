<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';
	import { Portal } from '@ark-ui/svelte/portal';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/shadcnio/button';
	import { cn } from '$lib/utils';

	import type { SheetContentProps } from './shared';
	import SheetClose from './sheet-close.svelte';
	import SheetOverlay from './sheet-overlay.svelte';
	import SheetPositioner from './sheet-positioner.svelte';
	let {
		showCloseButton = true,
		side: sideProp,
		placement,
		variant = 'default',
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: SheetContentProps = $props();
	const side = $derived(sideProp ?? placement ?? 'right');
</script>

<Portal
	><SheetOverlay /><SheetPositioner {side} {variant}
		><ArkDialog.Content
			class={cn(
				'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
				'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:data-[state=closed]:slide-out-to-bottom-10 data-[side=left]:data-[state=closed]:slide-out-to-left-10 data-[side=right]:data-[state=closed]:slide-out-to-right-10 data-[side=top]:data-[state=closed]:slide-out-to-top-10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:data-[state=open]:slide-in-from-bottom-10 data-[side=left]:data-[state=open]:slide-in-from-left-10 data-[side=right]:data-[state=open]:slide-in-from-right-10 data-[side=top]:data-[state=open]:slide-in-from-top-10',
				variant === 'inset' && 'sm:border',
				'motion-reduce:animate-none! motion-reduce:transition-none!',
				className
			)}
			data-side={side}
			data-slot="sheet-content"
			{...rest}
			bind:ref
			>{@render children?.()}{#if !!showCloseButton}<SheetClose
					>{#snippet asChild(props)}<Button
							{...props({ class: 'absolute top-3 end-3 absolute!' })}
							size="icon-sm"
							variant="ghost"><XIcon aria-hidden="true" /><span class="sr-only">Close</span></Button
						>{/snippet}</SheetClose
				>{/if}</ArkDialog.Content
		></SheetPositioner
	></Portal
>
