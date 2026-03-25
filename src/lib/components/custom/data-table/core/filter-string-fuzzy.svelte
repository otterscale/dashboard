<script lang="ts" module>
	import type { Table } from '@tanstack/table-core';

	export type FilterMessages = Record<string, string>;
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';

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
	const filterValue = $derived((column?.getFilterValue() as string) ?? '');
</script>

<Input
	placeholder={messages[columnId] ?? columnId}
	value={filterValue}
	oninput={(e) => column?.setFilterValue((e.currentTarget as HTMLInputElement).value || undefined)}
	class="h-8 w-[180px] text-xs"
/>
