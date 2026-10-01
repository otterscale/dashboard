<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import type { Column } from '@tanstack/table-core';
	import { type WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { viewMode } from '$lib/stores';

	import { getColumnLabel } from './column-labels';
	import type { DataSchemaType } from './utils';

	let {
		ref = $bindable(null),
		column,
		dataSchemas,
		children,
		class: className
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		column: Column<Record<string, JsonValue>>;
		dataSchemas: Record<string, DataSchemaType>;
	} = $props();

	const dataSchema = $derived(dataSchemas[column.id]);
	const label = $derived($viewMode === 'simple' ? getColumnLabel(column.id) : column.id);
	// Simple mode names the column in plain words, so the tooltip keeps the system name
	// within reach for when the two audiences need to talk about the same field.
	const hint = $derived($viewMode === 'simple' && label !== column.id ? column.id : dataSchema);
</script>

<div bind:this={ref} class={className}>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#if children}
				{@render children()}
			{:else}
				<h3>{label}</h3>
			{/if}
		</Tooltip.Trigger>
		{#if hint}
			<Tooltip.Content>
				{hint}
			</Tooltip.Content>
		{/if}
	</Tooltip.Root>
</div>
