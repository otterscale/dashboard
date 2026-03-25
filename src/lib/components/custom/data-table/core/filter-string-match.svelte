<script lang="ts">
	import type { Table } from '@tanstack/table-core';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Popover from '$lib/components/ui/popover';

	import type { FilterMessages } from './filter-string-fuzzy.svelte';

	let {
		columnId,
		values,
		messages,
		table
	}: {
		columnId: string;
		values: string[];
		messages: FilterMessages;
		table: Table<unknown>;
	} = $props();

	const column = $derived(table.getColumn(columnId));
	const filterValue = $derived((column?.getFilterValue() as string[]) ?? []);
	const uniqueValues = $derived([...new Set(values)].filter(Boolean));

	function toggle(v: string) {
		const current = filterValue;
		const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
		column?.setFilterValue(next.length ? next : undefined);
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" size="sm" class="h-8 gap-1 text-xs" {...props}>
				{messages[columnId] ?? columnId}
				{#if filterValue.length > 0}
					<Badge variant="secondary" class="px-1 text-xs">{filterValue.length}</Badge>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[180px] p-2">
		<div class="flex flex-col gap-1">
			{#each uniqueValues as v (v)}
				<label
					class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
				>
					<Checkbox checked={filterValue.includes(v)} onCheckedChange={() => toggle(v)} />
					{v}
				</label>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
