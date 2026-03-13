import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1ServiceAccount } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get serviceaccount
// NAME   NAMESPACE   SECRETS   AGE
type ServiceAccountAttribute =
	| 'Namespace'
	| 'Name'
	| 'Secrets'
	| 'Age'
	| 'raw';

function getServiceAccountDataSchemas(): Record<ServiceAccountAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Secrets: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getServiceAccountData(
	object: CoreV1ServiceAccount
): Record<ServiceAccountAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Secrets: object?.secrets?.length ?? 0,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getServiceAccountUISchemas(): Record<ServiceAccountAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Secrets: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getServiceAccountColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ServiceAccountAttribute, UISchemaType>,
	dataSchemas: Record<ServiceAccountAttribute, DataSchemaType>
): ColumnDef<Record<ServiceAccountAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: ServiceAccountAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<ServiceAccountAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<ServiceAccountAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<ServiceAccountAttribute, JsonValue>>;
			row: Row<Record<ServiceAccountAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		simpleColumn('Namespace'),
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ServiceAccountAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAccountAttribute, JsonValue>>;
				row: Row<Record<ServiceAccountAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as ServiceAccountAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Secrets'),
		simpleColumn('Age')
	];
}

export {
	getServiceAccountColumnDefinitions,
	getServiceAccountData,
	getServiceAccountDataSchemas,
	getServiceAccountUISchemas
};
