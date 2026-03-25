<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';

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
				<Icon icon="ph:dots-three-vertical" class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		{@render children?.()}
	</DropdownMenu.Content>
</DropdownMenu.Root>
