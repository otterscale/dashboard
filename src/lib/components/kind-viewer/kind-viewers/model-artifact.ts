import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ModelOtterscaleIoV1Alpha1ModelArtifact } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ModelArtifactAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model'
	| 'Reference'
	| 'Start Time'
	| 'Completion Time'
	| 'Format'
	| 'Status'
	| 'Age'
	| 'raw';

function getModelArtifactDataSchemas(): Record<ModelArtifactAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Model: 'text',
		Reference: 'text',
		'Start Time': 'time',
		'Completion Time': 'time',
		Format: 'text',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getModelArtifactData(
	object: ModelOtterscaleIoV1Alpha1ModelArtifact
): Record<ModelArtifactAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Model: object?.spec?.source?.huggingFace?.model ?? null,
		Reference: object?.status?.reference ?? null,
		'Start Time': object?.status?.startTime ?? null,
		'Completion Time': object?.status?.completionTime ?? null,
		Format: object?.spec?.format ?? null,
		Status:
			readyCondition?.status === 'True'
				? 'Ready'
				: readyCondition?.status === 'False'
					? readyCondition.reason
					: '',
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getModelArtifactUISchemas(): Record<ModelArtifactAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Model: 'text',
		Reference: 'link',
		'Start Time': 'time',
		'Completion Time': 'time',
		Format: 'text',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getModelArtifactColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ModelArtifactAttribute, UISchemaType>,
	dataSchemas: Record<ModelArtifactAttribute, DataSchemaType>
): ColumnDef<Record<ModelArtifactAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ModelArtifactAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Model',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model'
		},
		{
			id: 'Reference',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original['Name'] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Reference'
		},
		{
			id: 'Format',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Format'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Start Time',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Start Time'
		},
		{
			id: 'Completion Time',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Completion Time'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ModelArtifactAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelArtifactAttribute, JsonValue>>;
				row: Row<Record<ModelArtifactAttribute, JsonValue>>;
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
	getModelArtifactColumnDefinitions,
	getModelArtifactData,
	getModelArtifactDataSchemas,
	getModelArtifactUISchemas
};
