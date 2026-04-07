<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { type Column, type Row } from '@tanstack/table-core';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let {
		row,
		column
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
	} = $props();

	const data = $derived(row.original[column.id] as unknown as string);
</script>

<Tooltip.Provider>
	<Tooltip.Root>
		<Tooltip.Trigger class="w-full truncate text-left">
			{data}
		</Tooltip.Trigger>
		<Tooltip.Content>{data}</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
