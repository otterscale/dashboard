<script lang="ts" module>
	import type { JsonValue } from '@bufbuild/protobuf';

	export type ItemMetadata = {
		description: string | (() => string);
		hint?: string | (() => string);
	};
</script>

<script lang="ts">
	import { type Column, type Row } from '@tanstack/table-core';

	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let {
		row,
		column,
		metadata
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
		metadata: ItemMetadata;
	} = $props();

	const data = $derived(row.original[column.id] as unknown as string);
</script>

<Tooltip.Root>
	<Tooltip.Trigger class="block max-w-full truncate text-left">
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>{data}</Item.Title>
				<Item.Description>{metadata.description}</Item.Description>
			</Item.Content>
		</Item.Root>
	</Tooltip.Trigger>
	<Tooltip.Content>{metadata.hint ?? data}</Tooltip.Content>
</Tooltip.Root>
