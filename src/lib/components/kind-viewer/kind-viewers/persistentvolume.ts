import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1PersistentVolume } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get persistentvolume -o wide
// NAME   CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM   STORAGECLASS   REASON   AGE   VOLUMEMODE
type PVAttribute =
	| 'Name'
	| 'Capacity'
	| 'Access Modes'
	| 'Reclaim Policy'
	| 'Status'
	| 'Claim'
	| 'Storage Class'
	| 'Age'
	| 'Volume Mode'
	| 'raw';

function getPVDataSchemas(): Record<PVAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Capacity: 'text',
		'Access Modes': 'text',
		'Reclaim Policy': 'text',
		Status: 'text',
		Claim: 'text',
		'Storage Class': 'text',
		Age: 'time',
		'Volume Mode': 'text',
		raw: 'object'
	};
}

function getPVData(object: CoreV1PersistentVolume): Record<PVAttribute, JsonValue> {
	const accessModes = (object?.spec?.accessModes ?? []).join(', ');
	const capacity = (object?.spec?.capacity as Record<string, string>)?.storage ?? '';
	const claimRef = object?.spec?.claimRef;
	const claim = claimRef
		? `${claimRef.namespace ?? ''}/${claimRef.name ?? ''}`
		: null;

	return {
		Name: object?.metadata?.name ?? null,
		Capacity: capacity,
		'Access Modes': accessModes,
		'Reclaim Policy': object?.spec?.persistentVolumeReclaimPolicy ?? null,
		Status: object?.status?.phase ?? null,
		Claim: claim,
		'Storage Class': object?.spec?.storageClassName ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		'Volume Mode': object?.spec?.volumeMode ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getPVUISchemas(): Record<PVAttribute, UISchemaType> {
	return {
		Name: 'link',
		Capacity: 'text',
		'Access Modes': 'text',
		'Reclaim Policy': 'text',
		Status: 'text',
		Claim: 'text',
		'Storage Class': 'text',
		Age: 'time',
		'Volume Mode': 'text',
		raw: 'object'
	};
}

function getPVColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<PVAttribute, UISchemaType>,
	dataSchemas: Record<PVAttribute, DataSchemaType>
): ColumnDef<Record<PVAttribute, JsonValue>>[] {
	const simpleTextColumn = (
		id: PVAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<PVAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<PVAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<PVAttribute, JsonValue>>;
			row: Row<Record<PVAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<PVAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PVAttribute, JsonValue>>;
				row: Row<Record<PVAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as PVAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleTextColumn('Capacity'),
		simpleTextColumn('Access Modes'),
		simpleTextColumn('Reclaim Policy'),
		simpleTextColumn('Status'),
		simpleTextColumn('Claim'),
		simpleTextColumn('Storage Class'),
		simpleTextColumn('Age'),
		simpleTextColumn('Volume Mode', { class: 'hidden xl:table-cell' })
	];
}

export { getPVColumnDefinitions, getPVData, getPVDataSchemas, getPVUISchemas };
