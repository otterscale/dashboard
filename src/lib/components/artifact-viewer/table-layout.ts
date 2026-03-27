import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import type { ArtifactChartType, IndexChartType } from './types';

type ChartAttribute =
	| 'Helm Repository'
	| 'Chart Name'
	| 'Description'
	| 'Digest'
	| 'Version'
	| 'Type'
	| 'Labels'
	| 'Source'
	| 'icon'
	| 'helmRepository'
	| 'chart';

function getChartDataSchemas(): Record<ChartAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		Source: 'text',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartUISchemas(): Record<ChartAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		Source: 'text',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartDataFromHarbor(
	artifactChart: ArtifactChartType,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ChartAttribute, JsonValue> {
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		'Chart Name': artifactChart.repository_name ?? null,
		Description: artifactChart.extra_attrs?.description as JsonValue,
		Digest: artifactChart.digest ?? null,
		Version: artifactChart.extra_attrs?.version as JsonValue,
		Type: artifactChart.type ?? null,
		Labels: (artifactChart.labels ?? []) as JsonValue,
		Source: 'harbor',
		icon: artifactChart.extra_attrs?.icon as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: artifactChart as unknown as JsonValue
	};
}

function getChartDataFromIndex(
	indexChart: IndexChartType,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ChartAttribute, JsonValue> {
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		'Chart Name': indexChart.name ?? null,
		Description: indexChart.description as JsonValue,
		Digest: indexChart.digest ?? null,
		Version: indexChart.version as JsonValue,
		Type: indexChart.type ?? null,
		Labels: (indexChart.keywords ?? []) as JsonValue,
		Source: 'index',
		icon: indexChart.icon as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: indexChart as unknown as JsonValue
	};
}

function getChartColumnDefinitions(
	uiSchemas: Record<ChartAttribute, UISchemaType>,
	dataSchemas: Record<ChartAttribute, DataSchemaType>
): ColumnDef<Record<ChartAttribute, JsonValue>>[] {
	const columns: ChartAttribute[] = [
		'Chart Name',
		'Description',
		'Digest',
		'Type',
		'Version',
		'Labels',
		'Source',
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
