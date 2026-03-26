<script lang="ts">
	import { ChevronsUpDown } from '@lucide/svelte';
	import { getContext } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	let { class: className = undefined, ...restProps } = $props();

	const ctx = getContext<{
		getCurrentLabel: () => string;
		getOpen: () => boolean;
	}>('single-select');
</script>

<Popover.Trigger>
	{#snippet child({ props })}
		<Button
			variant="outline"
			role="combobox"
			class={cn('justify-between gap-2', className)}
			{...props}
			{...restProps}
		>
			<span class="truncate">{ctx.getCurrentLabel() || '…'}</span>
			<ChevronsUpDown class="size-4 shrink-0 opacity-50" />
		</Button>
	{/snippet}
</Popover.Trigger>
