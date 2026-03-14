import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1PersistentVolumeClaim } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get persistentvolumeclaim -o wide
// NAME   STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE   VOLUMEMODE
type PVCAttribute =
	| 'Namespace'
	| 'Name'
	| 'Status'
	| 'Volume'
	| 'Capacity'
	| 'Access Modes'
	| 'Storage Class'
	| 'Age'
	| 'Volume Mode'
	| 'raw';

function getPVCDataSchemas(): Record<PVCAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Status: 'text',
		Volume: 'text',
		Capacity: 'text',
		'Access Modes': 'text',
		'Storage Class': 'text',
		Age: 'time',
		'Volume Mode': 'text',
		raw: 'object'
	};
}

function getPVCData(object: CoreV1PersistentVolumeClaim): Record<PVCAttribute, JsonValue> {
	const accessModes = (object?.status?.accessModes ?? object?.spec?.accessModes ?? []).join(', ');
	const capacity = (object?.status?.capacity as Record<string, string>)?.storage ?? '';

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Status: object?.status?.phase ?? null,
		Volume: object?.spec?.volumeName ?? null,
		Capacity: capacity,
		'Access Modes': accessModes,
		'Storage Class': object?.spec?.storageClassName ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		'Volume Mode': object?.spec?.volumeMode ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getPVCUISchemas(): Record<PVCAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
		Status: 'text',
		Volume: 'text',
		Capacity: 'text',
		'Access Modes': 'text',
		'Storage Class': 'text',
		Age: 'time',
		'Volume Mode': 'text',
		raw: 'object'
	};
}

function getPVCColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<PVCAttribute, UISchemaType>,
	dataSchemas: Record<PVCAttribute, DataSchemaType>
): ColumnDef<Record<PVCAttribute, JsonValue>>[] {
	const simpleTextColumn = (
		id: PVCAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<PVCAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<PVCAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<PVCAttribute, JsonValue>>;
			row: Row<Record<PVCAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		simpleTextColumn('Namespace'),
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<PVCAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PVCAttribute, JsonValue>>;
				row: Row<Record<PVCAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original[column.id as PVCAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleTextColumn('Status'),
		simpleTextColumn('Volume'),
		simpleTextColumn('Capacity'),
		simpleTextColumn('Access Modes'),
		simpleTextColumn('Storage Class'),
		simpleTextColumn('Age'),
		simpleTextColumn('Volume Mode', { class: 'hidden xl:table-cell' })
	];
}

export { getPVCColumnDefinitions, getPVCData, getPVCDataSchemas, getPVCUISchemas };
