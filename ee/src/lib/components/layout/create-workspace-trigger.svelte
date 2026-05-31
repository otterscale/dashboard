<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { m } from '$lib/paraglide/messages';

	let { open = $bindable() }: { open: boolean } = $props();
</script>

<DropdownMenu.Item onclick={() => (open = true)}>
	<PlusIcon class="mr-2 size-4" />
	Create
</DropdownMenu.Item>
