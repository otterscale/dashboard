import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
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

import VmServicePortsCell from '../kind-viewer-actions/virtual-machine-service/vm-service-ports-cell.svelte';
import { buildResourceDetailUrl } from './resource-url';

// kubectl get vm -o wide
// NAME   AGE   STATUS   READY
type VirtualMachineAttribute =
	| 'Name'
	| 'Namespace'
	| 'Status'
	| 'Ready'
	| 'Running'
	| 'Instance Type'
	| 'Age'
	| 'Volumes'
	| 'Ports'
	| 'raw';

function getVirtualMachineDataSchemas(): Record<VirtualMachineAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Status: 'text',
		Ready: 'text',
		Running: 'text',
		'Instance Type': 'text',
		Age: 'time',
		Volumes: 'number',
		Ports: 'number',
		raw: 'object'
	};
}

function getVirtualMachineData(object: any): Record<VirtualMachineAttribute, JsonValue> {
	const instancetype = object?.spec?.instancetype;
	const instanceTypeDisplay = instancetype
		? `${instancetype.kind ?? 'VirtualMachineInstancetype'}/${instancetype.name}`
		: null;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Status: object?.status?.printableStatus ?? null,
		Ready: object?.status?.ready != null ? String(object.status.ready) : null,
		Running: object?.spec?.running != null ? String(object.spec.running) : null,
		'Instance Type': instanceTypeDisplay,
		Age: object?.metadata?.creationTimestamp ?? null,
		Volumes: object?.spec?.template?.spec?.volumes.length ?? null,
		Ports: 0,
		raw: (object as JsonObject) ?? null
	};
}

function getVirtualMachineUISchemas(): Record<VirtualMachineAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Status: 'text',
		Ready: 'text',
		Running: 'text',
		'Instance Type': 'text',
		Age: 'time',
		Volumes: 'array-of-object',
		Ports: 'number',
		raw: 'object'
	};
}

function getVirtualMachineColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<VirtualMachineAttribute, UISchemaType>,
	dataSchemas: Record<VirtualMachineAttribute, DataSchemaType>,
	cluster?: string
): ColumnDef<Record<VirtualMachineAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: VirtualMachineAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<VirtualMachineAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<VirtualMachineAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<VirtualMachineAttribute, JsonValue>>;
			row: Row<Record<VirtualMachineAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<VirtualMachineAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<VirtualMachineAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as VirtualMachineAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<VirtualMachineAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<VirtualMachineAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		simpleColumn('Status'),
		simpleColumn('Ready'),
		simpleColumn('Running'),
		simpleColumn('Instance Type'),
		simpleColumn('Age'),
		{
			id: 'Volumes',
			header: ({ column }: { column: Column<Record<VirtualMachineAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<VirtualMachineAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						items: ((row.original.raw as any)?.spec?.template?.spec?.volumes ?? []).map(
							(v: any) => {
								const volumeType = Object.keys(v).find((k) => k !== 'name') ?? 'unknown';
								return {
									title: v.name,
									description: volumeType,
									raw: v as JsonObject
								};
							}
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Volumes',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Ports',
			header: ({ column }: { column: Column<Record<VirtualMachineAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				row
			}: {
				column: Column<Record<VirtualMachineAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineAttribute, JsonValue>>;
			}) =>
				renderComponent(VmServicePortsCell, {
					vmName: row.original['Name'] as string,
					vmNamespace: row.original['Namespace'] as string,
					cluster: cluster ?? ''
				}),
			accessorKey: 'Ports',
			meta: { class: 'hidden xl:table-cell' }
		}
	];
}

export {
	getVirtualMachineColumnDefinitions,
	getVirtualMachineData,
	getVirtualMachineDataSchemas,
	getVirtualMachineUISchemas
};
