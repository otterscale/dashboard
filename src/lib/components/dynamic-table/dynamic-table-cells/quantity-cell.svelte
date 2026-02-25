<script lang="ts" module>
	import type { JsonValue } from '@bufbuild/protobuf';

	export type QuantityType = 'discrete' | 'continuous';

	export type QuantityMetadata = {
		type: QuantityType;
	};
</script>

<script lang="ts">
	import { type Column, type Row } from '@tanstack/table-core';

	import { formatWithBinarySuffix, quantityToScalar } from '../utils';

	let {
		row,
		column,
		metadata
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
		metadata: QuantityMetadata;
	} = $props();

	if (!metadata) {
		throw Error(`Expected metadata of ${column.id} for QuantityCell, but got metadata:`, metadata);
	}

	const data = $derived(row.original[column.id] ? String(row.original[column.id]) : undefined);
</script>

{#if data}
	{#if metadata.type === 'continuous'}
		{data}
	{:else if metadata.type === 'discrete'}
		{@const { value, unit } = formatWithBinarySuffix(BigInt(quantityToScalar(data)))}
		{`${value.toFixed(0)} ${unit}`}
	{/if}
{/if}
