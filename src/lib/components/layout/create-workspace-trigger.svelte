<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { m } from '$lib/messages';

	let {
		open = $bindable()
	}: {
		open: boolean;
	} = $props();
</script>

<DropdownMenu.Item class="gap-2 p-2" onSelect={() => (open = true)}>
	<PlusIcon class="size-4" />
	{m.add_workspace()}
</DropdownMenu.Item>