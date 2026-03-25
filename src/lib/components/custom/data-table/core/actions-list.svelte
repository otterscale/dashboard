<script lang="ts">
	import { EllipsisVertical } from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		open = $bindable(false),
		children
	}: {
		open?: boolean;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" class="size-8" {...props}>
				<EllipsisVertical class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		{@render children?.()}
	</DropdownMenu.Content>
</DropdownMenu.Root>
