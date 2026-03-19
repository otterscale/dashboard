import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ModelOtterscaleIoV1Alpha1ModelService } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ModelServiceAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model Name'
	| 'Accelerator'
	| 'Status'
	| 'Decode Tensor'
	| 'Decode Replicas'
	| 'Prefill Tensor'
	| 'Prefill Replicas'
	| 'Age'
	| 'raw';

function getModelServiceDataSchemas(): Record<ModelServiceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Model Name': 'text',
		Accelerator: 'text',
		Status: 'text',
		'Decode Tensor': 'object',
		'Decode Replicas': 'number',
		'Prefill Tensor': 'object',
		'Prefill Replicas': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getModelServiceData(
	object: ModelOtterscaleIoV1Alpha1ModelService
): Record<ModelServiceAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Model Name': object?.spec?.model?.name ?? null,
		Accelerator: object?.spec?.accelerator?.type ?? null,
		Status: object?.status?.phase ?? null,
		'Decode Tensor': object?.spec?.decode.parallelism?.tensor ?? null,
		'Decode Replicas': object?.spec?.decode?.replicas ?? null,
		'Prefill Tensor': object?.spec?.prefill?.parallelism?.tensor ?? null,
		'Prefill Replicas': object?.spec?.prefill?.replicas ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getModelServiceUISchemas(): Record<ModelServiceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Model Name': 'text',
		Accelerator: 'text',
		Status: 'text',
		'Decode Tensor': 'number',
		'Decode Replicas': 'number',
		'Prefill Tensor': 'number',
		'Prefill Replicas': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getModelServiceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ModelServiceAttribute, UISchemaType>,
	dataSchemas: Record<ModelServiceAttribute, DataSchemaType>
): ColumnDef<Record<ModelServiceAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ModelServiceAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Model Name',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model Name'
		},
		{
			id: 'Accelerator',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Accelerator'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Decode Tensor',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Decode Tensor'
		},
		{
			id: 'Decode Replicas',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Decode Replicas'
		},
		{
			id: 'Prefill Tensor',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Prefill Tensor'
		},
		{
			id: 'Prefill Replicas',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Prefill Replicas'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
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
	getModelServiceColumnDefinitions,
	getModelServiceData,
	getModelServiceDataSchemas,
	getModelServiceUISchemas
};
