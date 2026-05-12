<script lang="ts" module>
	import type { JsonValue } from '@bufbuild/protobuf';

	export type RatioMetadata = {
		numerator: JsonValue;
		denominator: JsonValue;
	};
</script>

<script lang="ts">
	import { type Column, type Row } from '@tanstack/table-core';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	let {
		row,
		column,
		metadata
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
		metadata: RatioMetadata;
	} = $props();

	// Validate once at init, metadata is set by table config and never mutates
	// svelte-ignore state_referenced_locally
	if (!metadata) {
		throw Error(`Expected metadata of ${column.id} for RatioCell, but got metadata:`, metadata);
	}

	const data = $derived(row.original[column.id] as number);
</script>

{#if data !== null}
	<Tooltip.Root>
		<Tooltip.Trigger class="ml-auto">
			{metadata.numerator}/{metadata.denominator}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{(Number(data) * 100).toFixed(2)}%
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{metadata.numerator}/{metadata.denominator}
{/if}
