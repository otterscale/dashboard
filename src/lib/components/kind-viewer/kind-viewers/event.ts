import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Event } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get event
// LAST SEEN   TYPE   REASON   OBJECT   MESSAGE
type EventAttribute =
	| 'Namespace'
	| 'Name'
	| 'Type'
	| 'Reason'
	| 'Object'
	| 'Message'
	| 'Count'
	| 'Age'
	| 'raw';

function getEventDataSchemas(): Record<EventAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Type: 'text',
		Reason: 'text',
		Object: 'text',
		Message: 'text',
		Count: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getEventData(object: CoreV1Event): Record<EventAttribute, JsonValue> {
	const involvedObject = object?.involvedObject;
	const objectDisplay = involvedObject
		? `${involvedObject.kind ?? ''}/${involvedObject.name ?? ''}`
		: null;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Type: object?.type ?? null,
		Reason: object?.reason ?? null,
		Object: objectDisplay,
		Message: object?.message ?? null,
		Count: object?.count ?? object?.series?.count ?? null,
		Age: object?.lastTimestamp ?? object?.eventTime ?? object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getEventUISchemas(): Record<EventAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Type: 'text',
		Reason: 'text',
		Object: 'text',
		Message: 'text',
		Count: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getEventColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<EventAttribute, UISchemaType>,
	dataSchemas: Record<EventAttribute, DataSchemaType>
): ColumnDef<Record<EventAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: EventAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<EventAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<EventAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<EventAttribute, JsonValue>>;
			row: Row<Record<EventAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		simpleColumn('Namespace'),
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<EventAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<EventAttribute, JsonValue>>;
				row: Row<Record<EventAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as EventAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Type'),
		simpleColumn('Reason'),
		simpleColumn('Object'),
		simpleColumn('Message'),
		simpleColumn('Count'),
		simpleColumn('Age')
	];
}

export { getEventColumnDefinitions, getEventData, getEventDataSchemas, getEventUISchemas };
