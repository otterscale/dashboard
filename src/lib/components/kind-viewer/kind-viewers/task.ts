import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type TaskAttribute =
	| 'Name'
	| 'Namespace'
	| 'State'
	| 'Ready'
	| 'Status'
	| 'Completions'
	| 'Age'
	| 'raw';

function getTaskDataSchemas(): Record<TaskAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		State: 'text',
		Ready: 'text',
		Status: 'text',
		Completions: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getTaskData(object: any): Record<TaskAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition: any) => condition.type === 'Ready'
	);

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		State: object?.status?.state ?? null,
		Ready:
			readyCondition?.status === 'True'
				? 'True'
				: readyCondition?.status === 'False'
					? 'False'
					: '',
		Status: object?.status?.status ?? null,
		Completions: object?.status?.completions != null ? String(object.status.completions) : null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getTaskUISchemas(): Record<TaskAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		State: 'text',
		Ready: 'text',
		Status: 'text',
		Completions: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getTaskColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<TaskAttribute, UISchemaType>,
	dataSchemas: Record<TaskAttribute, DataSchemaType>
): ColumnDef<Record<TaskAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as TaskAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'State',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'State'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Completions',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Completions'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<TaskAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<TaskAttribute, JsonValue>>;
				row: Row<Record<TaskAttribute, JsonValue>>;
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

export { getTaskColumnDefinitions, getTaskData, getTaskDataSchemas, getTaskUISchemas };
