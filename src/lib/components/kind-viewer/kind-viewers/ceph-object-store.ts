import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type CephObjectStoreAttribute =
	| 'Name'
	| 'Namespace'
	| 'Gateway Type'
	| 'Gateway Port'
	| 'Gateway Instances'
	| 'Phase'
	| 'Age'
	| 'raw';

function getCephObjectStoreDataSchemas(): Record<CephObjectStoreAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Gateway Type': 'text',
		'Gateway Port': 'number',
		'Gateway Instances': 'number',
		Phase: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getCephObjectStoreData(object: any): Record<CephObjectStoreAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Gateway Type': object?.spec?.gateway?.type ?? null,
		'Gateway Port': object?.spec?.gateway?.port ?? null,
		'Gateway Instances': object?.spec?.gateway?.instances ?? null,
		Phase: object?.status?.phase ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getCephObjectStoreUISchemas(): Record<CephObjectStoreAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Gateway Type': 'text',
		'Gateway Port': 'text',
		'Gateway Instances': 'text',
		Phase: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getCephObjectStoreColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<CephObjectStoreAttribute, UISchemaType>,
	dataSchemas: Record<CephObjectStoreAttribute, DataSchemaType>
): ColumnDef<Record<CephObjectStoreAttribute, JsonValue>>[] {
	const columns: CephObjectStoreAttribute[] = [
		'Name',
		'Namespace',
		'Gateway Type',
		'Gateway Port',
		'Gateway Instances',
		'Phase',
		'Age'
	];
	return columns.map((id) => {
		if (id === 'Name') {
			return {
				id: 'Name',
				header: ({ column }: { column: Column<Record<CephObjectStoreAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, { column, dataSchemas }),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<CephObjectStoreAttribute, JsonValue>>;
					row: Row<Record<CephObjectStoreAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas,
						metadata: {
							hyperlink: buildResourceDetailUrl(
								apiResource,
								row.original[column.id as CephObjectStoreAttribute] as string,
								row.original['Namespace'] as string
							)
						} satisfies LinkMetadata
					}),
				accessorKey: 'Name'
			};
		} else {
			return {
				id,
				header: ({ column }: { column: Column<Record<CephObjectStoreAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, {
						column,
						dataSchemas
					}),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<CephObjectStoreAttribute, JsonValue>>;
					row: Row<Record<CephObjectStoreAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas
					}),
				accessorKey: id
			};
		}
	});
}

export {
	getCephObjectStoreColumnDefinitions,
	getCephObjectStoreData,
	getCephObjectStoreDataSchemas,
	getCephObjectStoreUISchemas
};
