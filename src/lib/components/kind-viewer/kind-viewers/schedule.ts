import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ScheduleAttribute =
	| 'Name'
	| 'Namespace'
	| 'Schedule'
	| 'State'
	| 'Ready'
	| 'Suspend'
	| 'LastScheduleTime'
	| 'Age'
	| 'raw';

function getScheduleDataSchemas(): Record<ScheduleAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Schedule: 'text',
		State: 'text',
		Ready: 'text',
		Suspend: 'text',
		LastScheduleTime: 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getScheduleData(object: any): Record<ScheduleAttribute, JsonValue> {
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
		Suspend: object?.spec?.suspend != null ? String(object.spec.suspend) : null,
		LastScheduleTime: object?.status?.lastScheduleTime ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getScheduleUISchemas(): Record<ScheduleAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Schedule: 'text',
		State: 'text',
		Ready: 'text',
		Suspend: 'text',
		LastScheduleTime: 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getScheduleColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ScheduleAttribute, UISchemaType>,
	dataSchemas: Record<ScheduleAttribute, DataSchemaType>
): ColumnDef<Record<ScheduleAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ScheduleAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Schedule'
		},
		{
			id: 'Suspend',
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Suspend'
		},
		{
			id: 'LastScheduleTime',
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<ScheduleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ScheduleAttribute, JsonValue>>;
				row: Row<Record<ScheduleAttribute, JsonValue>>;
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
	getScheduleColumnDefinitions,
	getScheduleData,
	getScheduleDataSchemas,
	getScheduleUISchemas
};
