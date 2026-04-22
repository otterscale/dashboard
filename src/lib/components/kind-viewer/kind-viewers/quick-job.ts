import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type QuickJobAttribute =
	| 'Name'
	| 'Namespace'
	| 'State'
	| 'Ready'
	| 'Status'
	| 'Completions'
	| 'Age'
	| 'raw';

function getQuickJobDataSchemas(): Record<QuickJobAttribute, DataSchemaType> {
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

function getQuickJobData(object: any): Record<QuickJobAttribute, JsonValue> {
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

function getQuickJobUISchemas(): Record<QuickJobAttribute, UISchemaType> {
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

function getQuickJobColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<QuickJobAttribute, UISchemaType>,
	dataSchemas: Record<QuickJobAttribute, DataSchemaType>
): ColumnDef<Record<QuickJobAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as QuickJobAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickJobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickJobAttribute, JsonValue>>;
				row: Row<Record<QuickJobAttribute, JsonValue>>;
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
	getQuickJobColumnDefinitions,
	getQuickJobData,
	getQuickJobDataSchemas,
	getQuickJobUISchemas
};
