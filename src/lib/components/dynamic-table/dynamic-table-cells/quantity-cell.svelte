<script lang="ts" module>
	import type { JsonValue } from '@bufbuild/protobuf';

	export type QuantityType = 'discrete' | 'continuous';

	/** Binary suffixes understood as the base unit of a discrete scalar. */
	export type BinaryBaseUnit = 'Ki' | 'Mi' | 'Gi' | 'Ti' | 'Pi' | 'Ei';

	export type QuantityMetadata = {
		type: QuantityType;
		/**
		 * Base unit of the raw scalar value. Defaults to bytes. Set when the source
		 * value is already expressed in a binary unit, e.g. `nvidia.com/gpumem` is
		 * measured in `Mi`, so a value of `2400000` means 2400000 MiB, not bytes.
		 */
		baseUnit?: BinaryBaseUnit;
	};
</script>

<script lang="ts">
	import { type Column, type Row } from '@tanstack/table-core';

	import { binarySuffixFactors, formatWithBinarySuffix, quantityToScalar } from '../utils';

	let {
		row,
		column,
		metadata
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
		metadata: QuantityMetadata;
	} = $props();

	// Validate once at init, metadata is set by table config and never mutates
	// svelte-ignore state_referenced_locally
	if (!metadata) {
		throw Error(`Expected metadata of ${column.id} for QuantityCell, but got metadata:`, metadata);
	}

	const data = $derived(row.original[column.id] ? String(row.original[column.id]) : undefined);
</script>

{#if data}
	{#if metadata.type === 'continuous'}
		<!-- Continuous quantity in Kubernetes: integer without unit  -->
		{data}
	{:else if metadata.type === 'discrete'}
		<!-- Discrete quantity in Kubernetes: integer with optional binary prefix  -->
		{@const bytes =
			BigInt(quantityToScalar(data)) *
			(metadata.baseUnit ? binarySuffixFactors[metadata.baseUnit] : BigInt(1))}
		{@const { value, unit } = formatWithBinarySuffix(bytes)}
		{`${value.toFixed(0)} ${unit}`}
	{/if}
{/if}
