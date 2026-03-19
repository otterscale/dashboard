import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Service } from '@otterscale/types';
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

// kubectl get service -o wide
// NAME   TYPE   CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE   SELECTOR
type ServiceAttribute =
	| 'Name'
	| 'Namespace'
	| 'Type'
	| 'Cluster-IP'
	| 'External-IP'
	| 'Port(s)'
	| 'Age'
	| 'Selector'
	| 'raw';

function getServiceDataSchemas(): Record<ServiceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Type: 'text',
		'Cluster-IP': 'text',
		'External-IP': 'text',
		'Port(s)': 'object',
		Age: 'time',
		Selector: 'object',
		raw: 'object'
	};
}

function getServiceData(object: CoreV1Service): Record<ServiceAttribute, JsonValue> {
	// Determine External-IP: LoadBalancer ingress IP/hostname, or externalIPs[0], or '<none>'
	const lbIngress = object?.status?.loadBalancer?.ingress ?? [];
	let externalIP = '<none>';
	if (lbIngress.length > 0) {
		externalIP = lbIngress[0]?.ip ?? lbIngress[0]?.hostname ?? '<none>';
	} else if ((object?.spec?.externalIPs ?? []).length > 0) {
		externalIP = object.spec!.externalIPs![0];
	}

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Type: object?.spec?.type ?? null,
		'Cluster-IP': object?.spec?.clusterIP ?? null,
		'External-IP': externalIP,
		'Port(s)': (object?.spec?.ports as JsonValue) ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		Selector: (object?.spec?.selector as JsonValue) ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getServiceUISchemas(): Record<ServiceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Type: 'text',
		'Cluster-IP': 'text',
		'External-IP': 'text',
		'Port(s)': 'array-of-object',
		Age: 'time',
		Selector: 'array-of-object',
		raw: 'object'
	};
}

function getServiceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ServiceAttribute, UISchemaType>,
	dataSchemas: Record<ServiceAttribute, DataSchemaType>
): ColumnDef<Record<ServiceAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ServiceAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Type',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Type'
		},
		{
			id: 'Cluster-IP',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Cluster-IP'
		},
		{
			id: 'External-IP',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'External-IP'
		},
		{
			id: 'Port(s)',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: ((row.original.raw as CoreV1Service).spec?.ports ?? []).map((p) => ({
							title: p.name ?? `${p.port}`,
							description: `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol ?? 'TCP'}`,
							raw: p as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Port(s)',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		},
		{
			id: 'Selector',
			header: ({ column }: { column: Column<Record<ServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ServiceAttribute, JsonValue>>;
				row: Row<Record<ServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries((row.original.raw as CoreV1Service).spec?.selector ?? {}).map(
							([key, value]) => ({
								title: key,
								description: value,
								raw: { key, value }
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Selector',
			meta: { class: 'hidden xl:table-cell' }
		}
	];
}

export { getServiceColumnDefinitions, getServiceData, getServiceDataSchemas, getServiceUISchemas };
