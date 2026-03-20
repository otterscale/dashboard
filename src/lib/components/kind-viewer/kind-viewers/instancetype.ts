import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get virtualmachineinstancetypes -o wide
// NAME   AGE
type VirtualMachineInstancetypeAttribute =
	| 'Name'
	| 'Namespace'
	| 'CPU'
	| 'Memory'
	| 'GPUs'
	| 'Age'
	| 'raw';

function getVirtualMachineInstancetypeDataSchemas(): Record<
	VirtualMachineInstancetypeAttribute,
	DataSchemaType
> {
	return {
		Name: 'text',
		Namespace: 'text',
		CPU: 'number',
		Memory: 'text',
		GPUs: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getVirtualMachineInstancetypeData(
	object: any
): Record<VirtualMachineInstancetypeAttribute, JsonValue> {
	const cpuGuest = object?.spec?.cpu?.guest ?? null;
	const memoryGuest = object?.spec?.memory?.guest ?? null;
	const gpus = object?.spec?.gpus;
	const gpuCount = Array.isArray(gpus) ? gpus.length : 0;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		CPU: cpuGuest != null ? Number(cpuGuest) : null,
		Memory: memoryGuest,
		GPUs: gpuCount,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getVirtualMachineInstancetypeUISchemas(): Record<
	VirtualMachineInstancetypeAttribute,
	UISchemaType
> {
	return {
		Name: 'link',
		Namespace: 'link',
		CPU: 'text',
		Memory: 'text',
		GPUs: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getVirtualMachineInstancetypeColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<VirtualMachineInstancetypeAttribute, UISchemaType>,
	dataSchemas: Record<VirtualMachineInstancetypeAttribute, DataSchemaType>
): ColumnDef<Record<VirtualMachineInstancetypeAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: VirtualMachineInstancetypeAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<VirtualMachineInstancetypeAttribute, JsonValue>> => ({
		id,
		header: ({
			column
		}: {
			column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
			row: Row<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({
				column
			}: {
				column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
			}) => renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original[column.id as VirtualMachineInstancetypeAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({
				column
			}: {
				column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
			}) => renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
				row: Row<Record<VirtualMachineInstancetypeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original['Namespace']}?group=&version=v1&kind=Namespace&resource=namespaces&namespaced=false`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Namespace'
		},
		simpleColumn('CPU'),
		simpleColumn('Memory'),
		simpleColumn('GPUs', { class: 'hidden lg:table-cell' }),
		simpleColumn('Age')
	];
}

export {
	getVirtualMachineInstancetypeColumnDefinitions,
	getVirtualMachineInstancetypeData,
	getVirtualMachineInstancetypeDataSchemas,
	getVirtualMachineInstancetypeUISchemas
};
