import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type QuickCronjobAttribute =
	| 'Name'
	| 'Namespace'
	| 'Schedule'
	| 'State'
	| 'Ready'
	| 'LastScheduleTime'
	| 'Age'
	| 'raw';

function getQuickCronjobDataSchemas(): Record<QuickCronjobAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Schedule: 'text',
		State: 'text',
		Ready: 'text',
		LastScheduleTime: 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getQuickCronjobData(object: any): Record<QuickCronjobAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition: any) => condition.type === 'Ready'
	);

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Schedule: object?.spec?.cronSchedule ?? null,
		State: object?.status?.state ?? null,
		Ready:
			readyCondition?.status === 'True'
				? 'True'
				: readyCondition?.status === 'False'
					? 'False'
					: '',
		LastScheduleTime: object?.status?.lastScheduleTime ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getQuickCronjobUISchemas(): Record<QuickCronjobAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Schedule: 'text',
		State: 'text',
		Ready: 'text',
		LastScheduleTime: 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getQuickCronjobColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<QuickCronjobAttribute, UISchemaType>,
	dataSchemas: Record<QuickCronjobAttribute, DataSchemaType>
): ColumnDef<Record<QuickCronjobAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as QuickCronjobAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'Schedule',
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Schedule'
		},
		{
			id: 'LastScheduleTime',
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'LastScheduleTime'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<QuickCronjobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<QuickCronjobAttribute, JsonValue>>;
				row: Row<Record<QuickCronjobAttribute, JsonValue>>;
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
	getQuickCronjobColumnDefinitions,
	getQuickCronjobData,
	getQuickCronjobDataSchemas,
	getQuickCronjobUISchemas
};
