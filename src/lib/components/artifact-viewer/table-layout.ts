import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import type { ChartArtifact, ChartType } from './types';

type ChartAttribute =
	| 'Helm Repository'
	| 'Repository'
	| 'Digest'
	| 'Version'
	| 'Type'
	| 'Labels'
	| 'helmRepository'
	| 'chart';

function getChartDataSchemas(): Record<ChartAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		Repository: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartUISchemas(): Record<ChartAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		Repository: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartDataFromHarbor(
	chartArtifact: ChartArtifact,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ChartAttribute, JsonValue> {
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		Repository: chartArtifact.repository_name ?? null,
		Digest: chartArtifact.digest ?? null,
		Version: chartArtifact.extra_attrs?.version as JsonValue,
		Type: chartArtifact.type ?? null,
		Labels: (chartArtifact.labels ?? []) as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: chartArtifact as unknown as JsonValue
	};
}

function getChartDataFromIndex(
	chart: ChartType,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ChartAttribute, JsonValue> {
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		Repository: chart.name ?? null,
		Digest: chart.digest ?? null,
		Version: chart.version as JsonValue,
		Type: chart.type ?? null,
		Labels: (chart.keywords ?? []) as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: chart as unknown as JsonValue
	};
}

function getChartColumnDefinitions(
	uiSchemas: Record<ChartAttribute, UISchemaType>,
	dataSchemas: Record<ChartAttribute, DataSchemaType>
): ColumnDef<Record<ChartAttribute, JsonValue>>[] {
	const columns: ChartAttribute[] = [
		'Repository',
		'Digest',
		'Type',
		'Version',
		'Labels',
		'Helm Repository'
	];

	return columns.map((id) => {
		return {
			id,
			header: ({ column }: { column: Column<Record<ChartAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column,
					dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ChartAttribute, JsonValue>>;
				row: Row<Record<ChartAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas
				}),
			accessorKey: id
		};
	});
}

export {
	type ChartAttribute,
	getChartColumnDefinitions,
	getChartDataFromHarbor,
	getChartDataFromIndex,
	getChartDataSchemas,
	getChartUISchemas
};
