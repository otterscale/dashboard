import { type JsonValue } from '@bufbuild/protobuf';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { QuantityMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/quantity-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { formatWithBinarySuffix } from '$lib/components/dynamic-table/utils.ts';
import { renderComponent } from '$lib/components/ui/data-table';
import type { ArtifactType } from '$lib/server/harbor';

type ArtifactAttribute =
	| 'Repository'
	| 'Digest'
	| 'Tags'
	| 'Size'
	| 'Push Time'
	| 'Pull Time'
	| 'Type'
	| 'Labels'
	| 'raw';

function getArtifactDataSchemas(): Record<ArtifactAttribute, DataSchemaType> {
	return {
		Repository: 'text',
		Digest: 'text',
		Tags: 'array',
		Size: 'quantity',
		'Push Time': 'time',
		'Pull Time': 'time',
		Type: 'text',
		Labels: 'array',
		raw: 'object'
	};
}

function getArtifactUISchemas(): Record<ArtifactAttribute, UISchemaType> {
	return {
		Repository: 'text',
		Digest: 'text',
		Tags: 'array',
		Size: 'quantity',
		'Push Time': 'time',
		'Pull Time': 'time',
		Type: 'text',
		Labels: 'array',
		raw: 'object'
	};
}

function getArtifactData(artifact: ArtifactType): Record<ArtifactAttribute, JsonValue> {
	const tags = (artifact.tags ?? []).map((t) => t.name);

	const { value: sizeValue, unit: sizeUnit } = formatWithBinarySuffix(BigInt(artifact.size));

	return {
		Repository: artifact.repository_name,
		Digest: artifact.digest ? artifact.digest.slice(0, 19) : null,
		Tags: tags as JsonValue,
		Size: `${sizeValue.toFixed(0)}${sizeUnit}`,
		'Push Time': artifact.push_time ?? null,
		'Pull Time': artifact.pull_time ?? null,
		Type: artifact.type ?? null,
		Labels: (artifact.labels ?? []).map((l) => l.name) as JsonValue,
		raw: artifact as unknown as JsonValue
	};
}

function getArtifactColumnDefinitions(
	uiSchemas: Record<ArtifactAttribute, UISchemaType>,
	dataSchemas: Record<ArtifactAttribute, DataSchemaType>
): ColumnDef<Record<ArtifactAttribute, JsonValue>>[] {
	const columns: ArtifactAttribute[] = [
		'Repository',
		'Digest',
		'Type',
		'Tags',
		'Labels',
		'Size',
		'Push Time',
		'Pull Time'
	];

	return columns.map((id) => {
		if (id === 'Size') {
			return {
				id,
				header: ({ column }: { column: Column<Record<ArtifactAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, {
						column,
						dataSchemas
					}),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<ArtifactAttribute, JsonValue>>;
					row: Row<Record<ArtifactAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas,
						metadata: {
							type: 'discrete'
						} satisfies QuantityMetadata
					}),
				accessorKey: id
			};
		} else {
			return {
				id,
				header: ({ column }: { column: Column<Record<ArtifactAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, {
						column,
						dataSchemas
					}),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<ArtifactAttribute, JsonValue>>;
					row: Row<Record<ArtifactAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas
					}),
				accessorKey: id
			};
		}
	});
}

export {
	type ArtifactAttribute,
	getArtifactColumnDefinitions,
	getArtifactData,
	getArtifactDataSchemas,
	getArtifactUISchemas
};
