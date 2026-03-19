import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type HelmRepositoryAttribute =
	| 'Name'
	| 'Namespace'
	| 'Type'
	| 'URL'
	| 'Interval'
	| 'Status'
	| 'Reason'
	| 'Age'
	| 'raw';

function getHelmRepositoryDataSchemas(): Record<HelmRepositoryAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Type: 'text',
		URL: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getHelmRepositoryData(
	object: SourceToolkitFluxcdIoV1HelmRepository
): Record<HelmRepositoryAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Type: object?.spec?.type ?? null,
		URL: object?.spec?.url ?? null,
		Interval: object?.spec?.interval ?? null,
		Status: readyCondition?.status ?? null,
		Reason: readyCondition?.reason ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getHelmRepositoryUISchemas(): Record<HelmRepositoryAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Type: 'text',
		URL: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getHelmRepositoryColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<HelmRepositoryAttribute, UISchemaType>,
	dataSchemas: Record<HelmRepositoryAttribute, DataSchemaType>
): ColumnDef<Record<HelmRepositoryAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as HelmRepositoryAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Type',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Type'
		},
		{
			id: 'URL',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'URL'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Reason',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Reason'
		},
		{
			id: 'Interval',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Interval'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<HelmRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmRepositoryAttribute, JsonValue>>;
				row: Row<Record<HelmRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		}
	];
}

export {
	getHelmRepositoryColumnDefinitions,
	getHelmRepositoryData,
	getHelmRepositoryDataSchemas,
	getHelmRepositoryUISchemas
};
