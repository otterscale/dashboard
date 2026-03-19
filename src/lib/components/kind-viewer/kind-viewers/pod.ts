import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Pod } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import {
	type ArrayOfObjectItemsType,
	type ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get pod -o wide
// NAME   READY   STATUS   RESTARTS   AGE   IP   NODE   NOMINATED NODE   READINESS GATES
type PodAttribute =
	| 'Name'
	| 'Namespace'
	| 'Ready'
	| 'Status'
	| 'Restarts'
	| 'Age'
	| 'IP'
	| 'Node'
	| 'Nominated Node'
	| 'Readiness Gates'
	| 'raw';

function getPodDataSchemas(): Record<PodAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Ready: 'text',
		Status: 'text',
		Restarts: 'number',
		Age: 'time',
		IP: 'text',
		Node: 'text',
		'Nominated Node': 'text',
		'Readiness Gates': 'number',
		raw: 'object'
	};
}

function getPodData(object: CoreV1Pod): Record<PodAttribute, JsonValue> {
	const containerStatuses = object?.status?.containerStatuses ?? [];
	const totalContainers = object?.spec?.containers?.length ?? 0;
	const readyContainers = containerStatuses.filter((cs) => cs.ready).length;
	const totalRestarts = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0);
	const readinessGatesCount = object?.spec?.readinessGates?.length ?? 0;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Ready: `${readyContainers}/${totalContainers}`,
		Status: object?.status?.phase ?? null,
		Restarts: totalRestarts,
		Age: object?.metadata?.creationTimestamp ?? null,
		IP: object?.status?.podIP ?? null,
		Node: object?.spec?.nodeName ?? null,
		'Nominated Node': object?.status?.nominatedNodeName ?? null,
		'Readiness Gates': readinessGatesCount > 0 ? readinessGatesCount : null,
		raw: (object as JsonObject) ?? null
	};
}

function getPodUISchemas(): Record<PodAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Ready: 'text',
		Status: 'text',
		Restarts: 'text',
		Age: 'time',
		IP: 'text',
		Node: 'text',
		'Nominated Node': 'text',
		'Readiness Gates': 'array-of-object',
		raw: 'object'
	};
}

function getPodColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<PodAttribute, UISchemaType>,
	dataSchemas: Record<PodAttribute, DataSchemaType>
): ColumnDef<Record<PodAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as PodAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Restarts',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Restarts'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		},
		{
			id: 'IP',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'IP',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Node',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Node',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Nominated Node',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Nominated Node',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Readiness Gates',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: ((row.original.raw as CoreV1Pod).spec?.readinessGates ?? []).map((gate) => ({
							title: gate.conditionType,
							raw: gate
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Readiness Gates',
			meta: {
				class: 'hidden xl:table-cell'
			}
		}
	];
}

export { getPodColumnDefinitions, getPodData, getPodDataSchemas, getPodUISchemas };
