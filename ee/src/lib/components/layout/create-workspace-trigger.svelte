<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import { page } from '$app/state';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { open = $bindable() }: { open: boolean } = $props();
</script>

{#if !page.data.isRestricted}
	<DropdownMenu.Separator />
	<DropdownMenu.Item onclick={() => (open = true)}>
		<PlusIcon class="mr-2 size-4" />
		Create
	</DropdownMenu.Item>
{/if}
