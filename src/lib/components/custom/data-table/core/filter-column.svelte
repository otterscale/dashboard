<script lang="ts">
	import type { Table } from '@tanstack/table-core';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { FilterMessages } from './filter-string-fuzzy.svelte';

	let {
		messages,
		table
	}: {
		messages: FilterMessages;
		table: Table<unknown>;
	} = $props();

	const columns = $derived(table.getAllColumns().filter((c) => c.getCanHide()));
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" size="sm" class="h-8 gap-1 text-xs" {...props}>Columns</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[180px] p-2">
		<div class="flex flex-col gap-1">
			{#each columns as col (col.id)}
				<label
					class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
				>
					<Checkbox
						checked={col.getIsVisible()}
						onCheckedChange={(v) => col.toggleVisibility(!!v)}
					/>
					{messages[col.id] ?? col.id}
				</label>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
