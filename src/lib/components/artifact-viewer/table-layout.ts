import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { QuantityMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/quantity-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { formatWithBinarySuffix } from '$lib/components/dynamic-table/utils.ts';
import { renderComponent } from '$lib/components/ui/data-table';

import type { ChartArtifact } from './types';

type ArtifactAttribute =
	| 'Helm Repository'
	| 'Repository'
	| 'Digest'
	| 'Version'
	| 'Size'
	| 'Push Time'
	| 'Pull Time'
	| 'Type'
	| 'Labels'
	| 'helmRepository'
	| 'chartArtifact';

function getArtifactDataSchemas(): Record<ArtifactAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		Repository: 'text',
		Digest: 'text',
		Version: 'text',
		Size: 'quantity',
		'Push Time': 'time',
		'Pull Time': 'time',
		Type: 'text',
		Labels: 'array',
		helmRepository: 'object',
		chartArtifact: 'object'
	};
}

function getArtifactUISchemas(): Record<ArtifactAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		Repository: 'text',
		Digest: 'text',
		Version: 'text',
		Size: 'quantity',
		'Push Time': 'time',
		'Pull Time': 'time',
		Type: 'text',
		Labels: 'array',
		helmRepository: 'object',
		chartArtifact: 'object'
	};
}

function getArtifactData(
	chartArtifact: ChartArtifact,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ArtifactAttribute, JsonValue> {
	const hasSize = chartArtifact.size > 0;
	const { value: sizeValue, unit: sizeUnit } = hasSize
		? formatWithBinarySuffix(BigInt(chartArtifact.size))
		: { value: 0, unit: 'B' };

	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		Repository: chartArtifact.repository_name,
		Digest: chartArtifact.digest ? chartArtifact.digest.slice(0, 19) : null,
		Version: chartArtifact.extra_attrs?.version as JsonValue,
		Size: hasSize ? `${sizeValue.toFixed(0)}${sizeUnit}` : null,
		'Push Time': chartArtifact.push_time ?? null,
		'Pull Time': chartArtifact.pull_time ?? null,
		Type: chartArtifact.type ?? null,
		Labels: (chartArtifact.labels ?? []).map((l) => l.name) as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chartArtifact: chartArtifact as unknown as JsonValue
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
		'Version',
		'Size',
		'Push Time',
		'Pull Time',
		'Labels',
		'Helm Repository'
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
