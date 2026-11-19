<script lang="ts">
	import { Dialog as ArkDialog } from '@ark-ui/svelte/dialog';

	import { cn } from '$lib/utils';

	import { type SheetPositionerProps, sheetPositionerVariants } from './shared';
	let {
		variant = 'default',
		side: sideProp,
		placement,
		class: className,
		ref = $bindable(null),
		...rest
	}: SheetPositionerProps = $props();
	const side = $derived(sideProp ?? placement);
</script>

<ArkDialog.Positioner
	class={cn(sheetPositionerVariants({ variant }), className)}
	data-placement={side}
	data-side={side}
	data-slot="sheet-positioner"
	data-variant={variant}
	{...rest}
	bind:ref
/>
