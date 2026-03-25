<script lang="ts">
	import { Search } from '@lucide/svelte';
	import type { Table } from '@tanstack/table-core';

	let { table }: { table: Table<unknown> } = $props();

	const isEmpty = $derived(table.getFilteredRowModel().rows.length === 0);
</script>

{#if isEmpty}
	<tr>
		<td colspan={table.getAllColumns().length} class="h-32 text-center text-muted-foreground">
			<div class="flex flex-col items-center justify-center gap-2">
				<Search class="size-8 opacity-40" />
				<p class="text-sm">No results.</p>
			</div>
		</td>
	</tr>
{/if}
