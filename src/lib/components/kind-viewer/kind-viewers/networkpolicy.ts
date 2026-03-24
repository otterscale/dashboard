import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { NetworkingK8SIoV1NetworkPolicy } from '@otterscale/types';
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

// kubectl get networkpolicy -o wide
// NAME   POD-SELECTOR   AGE
type NetworkPolicyAttribute =
	| 'Name'
	| 'Namespace'
	| 'Pod-Selector'
	| 'Ingress Rules'
	| 'Egress Rules'
	| 'Age'
	| 'raw';

function getNetworkPolicyDataSchemas(): Record<NetworkPolicyAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Pod-Selector': 'number',
		'Ingress Rules': 'number',
		'Egress Rules': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getNetworkPolicyData(
	object: NetworkingK8SIoV1NetworkPolicy
): Record<NetworkPolicyAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Pod-Selector': Object.keys(object?.spec?.podSelector?.matchLabels ?? {}).length,
		'Ingress Rules': object?.spec?.ingress?.length ?? 0,
		'Egress Rules': object?.spec?.egress?.length ?? 0,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getNetworkPolicyUISchemas(): Record<NetworkPolicyAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Pod-Selector': 'array-of-object',
		'Ingress Rules': 'number',
		'Egress Rules': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getNetworkPolicyColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<NetworkPolicyAttribute, UISchemaType>,
	dataSchemas: Record<NetworkPolicyAttribute, DataSchemaType>
): ColumnDef<Record<NetworkPolicyAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as NetworkPolicyAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Pod-Selector',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries(
							(row.original.raw as NetworkingK8SIoV1NetworkPolicy).spec?.podSelector?.matchLabels ??
								{}
						).map(([key, value]) => ({
							title: key,
							description: value,
							raw: { key, value }
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Pod-Selector'
		},
		{
			id: 'Ingress Rules',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ingress Rules',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Egress Rules',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Egress Rules',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<NetworkPolicyAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NetworkPolicyAttribute, JsonValue>>;
				row: Row<Record<NetworkPolicyAttribute, JsonValue>>;
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
	getNetworkPolicyColumnDefinitions,
	getNetworkPolicyData,
	getNetworkPolicyDataSchemas,
	getNetworkPolicyUISchemas
};
