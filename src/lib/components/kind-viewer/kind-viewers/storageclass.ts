import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { StorageK8SIoV1StorageClass } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get storageclass -o wide
// NAME   PROVISIONER   RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
type StorageClassAttribute =
	| 'Name'
	| 'Provisioner'
	| 'Reclaim Policy'
	| 'Volume Binding Mode'
	| 'Allow Volume Expansion'
	| 'Age'
	| 'raw';

function getStorageClassDataSchemas(): Record<StorageClassAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Provisioner: 'text',
		'Reclaim Policy': 'text',
		'Volume Binding Mode': 'text',
		'Allow Volume Expansion': 'boolean',
		Age: 'time',
		raw: 'object'
	};
}

function getStorageClassData(
	object: StorageK8SIoV1StorageClass
): Record<StorageClassAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Provisioner: object?.provisioner ?? null,
		'Reclaim Policy': object?.reclaimPolicy ?? null,
		'Volume Binding Mode': object?.volumeBindingMode ?? null,
		'Allow Volume Expansion': object?.allowVolumeExpansion ?? false,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getStorageClassUISchemas(): Record<StorageClassAttribute, UISchemaType> {
	return {
		Name: 'link',
		Provisioner: 'text',
		'Reclaim Policy': 'text',
		'Volume Binding Mode': 'text',
		'Allow Volume Expansion': 'boolean',
		Age: 'time',
		raw: 'object'
	};
}

function getStorageClassColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<StorageClassAttribute, UISchemaType>,
	dataSchemas: Record<StorageClassAttribute, DataSchemaType>
): ColumnDef<Record<StorageClassAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: StorageClassAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<StorageClassAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<StorageClassAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<StorageClassAttribute, JsonValue>>;
			row: Row<Record<StorageClassAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<StorageClassAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StorageClassAttribute, JsonValue>>;
				row: Row<Record<StorageClassAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as StorageClassAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Provisioner'),
		simpleColumn('Reclaim Policy'),
		simpleColumn('Volume Binding Mode'),
		simpleColumn('Allow Volume Expansion'),
		simpleColumn('Age')
	];
}

export {
	getStorageClassColumnDefinitions,
	getStorageClassData,
	getStorageClassDataSchemas,
	getStorageClassUISchemas
};
