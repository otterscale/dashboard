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

	// Validate once at init, metadata is set by table config and never mutates
	// svelte-ignore state_referenced_locally
	if (!metadata) {
		throw Error(`Expected metadata of ${column.id} for ItemCell, but got metadata:`, metadata);
	}

	const data = $derived(row.original[column.id] as unknown as string);
</script>

<Tooltip.Root>
	<Tooltip.Trigger class="block max-w-full truncate text-left">
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>{data}</Item.Title>
				<Item.Description>
					{@const description =
						typeof metadata.description === 'function'
							? metadata.description()
							: metadata.description}
					{description}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Tooltip.Trigger>
	<Tooltip.Content>
		{@const hint = metadata.hint
			? typeof metadata.hint === 'function'
				? metadata.hint()
				: metadata.hint
			: data}
		{hint}
	</Tooltip.Content>
</Tooltip.Root>
