<script lang="ts">
	import { Popover as ArkPopover, usePopoverContext } from '@ark-ui/svelte/popover';
	import { Portal } from '@ark-ui/svelte/portal';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/shadcnio/button/index.js';
	import { cn } from '$lib/utils';

	import PopoverClose from './popover-close.svelte';
	import PopoverLabelsContext from './popover-labels-context.svelte';
	import PopoverPositioner from './popover-positioner.svelte';
	import type { PopoverContentProps } from './shared';
	let {
		showCloseButton = false,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: PopoverContentProps = $props();
	const popover = usePopoverContext();
	let labelled = $state(false);
	const setLabelled = (
		next: typeof labelled | ((previous: typeof labelled) => typeof labelled)
	) => {
		labelled = typeof next === 'function' ? next(labelled) : next;
	};
	let described = $state(false);
	const setDescribed = (
		next: typeof described | ((previous: typeof described) => typeof described)
	) => {
		described = typeof next === 'function' ? next(described) : next;
	};
	const labels = $derived.by(() => ({ setDescribed, setLabelled }));
</script>

<Portal
	><PopoverPositioner
		><ArkPopover.Content
			aria-describedby={described ? popover().getDescriptionProps().id : undefined}
			aria-labelledby={labelled ? popover().getTitleProps().id : undefined}
			class={cn(
				'z-50 flex w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className
			)}
			data-slot="popover-content"
			{...rest}
			bind:ref
			><PopoverLabelsContext value={labels}>{@render children?.()}</PopoverLabelsContext
			>{#if !!showCloseButton}<PopoverClose
					>{#snippet asChild(props)}<Button
							{...props({
								'aria-label': 'Close',
								class: 'absolute inset-e-2 top-2 opacity-64 hover:opacity-100'
							})}
							size="icon-sm"
							variant="ghost"><XIcon /></Button
						>{/snippet}</PopoverClose
				>{/if}</ArkPopover.Content
		></PopoverPositioner
	></Portal
>
