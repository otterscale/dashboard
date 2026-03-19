import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Node } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get node -o wide
// NAME   STATUS   ROLES   AGE   VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE   KERNEL-VERSION   CONTAINER-RUNTIME
type NodeAttribute =
	| 'Name'
	| 'Status'
	| 'Roles'
	| 'Age'
	| 'Version'
	| 'Internal-IP'
	| 'External-IP'
	| 'OS-Image'
	| 'Kernel-Version'
	| 'Container-Runtime'
	| 'raw';

function getNodeDataSchemas(): Record<NodeAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Status: 'text',
		Roles: 'text',
		Age: 'time',
		Version: 'text',
		'Internal-IP': 'text',
		'External-IP': 'text',
		'OS-Image': 'text',
		'Kernel-Version': 'text',
		'Container-Runtime': 'text',
		raw: 'object'
	};
}

function getNodeData(object: CoreV1Node): Record<NodeAttribute, JsonValue> {
	// Derive Status from Ready condition
	const readyCondition = (object?.status?.conditions ?? []).find((c) => c.type === 'Ready');
	let status = 'Unknown';
	if (readyCondition) {
		status = readyCondition.status === 'True' ? 'Ready' : 'NotReady';
	}
	if (object?.spec?.unschedulable) {
		status += ',SchedulingDisabled';
	}

	// Derive Roles from labels (node-role.kubernetes.io/<role>)
	const labels = object?.metadata?.labels ?? {};
	const rolePrefix = 'node-role.kubernetes.io/';
	const roles = Object.keys(labels)
		.filter((k) => k.startsWith(rolePrefix))
		.map((k) => k.slice(rolePrefix.length));
	const rolesDisplay = roles.length > 0 ? roles.join(',') : '<none>';

	// Extract addresses
	const addresses = object?.status?.addresses ?? [];
	const internalIP = addresses.find((a) => a.type === 'InternalIP')?.address ?? '<none>';
	const externalIP = addresses.find((a) => a.type === 'ExternalIP')?.address ?? '<none>';

	const nodeInfo = object?.status?.nodeInfo;

	return {
		Name: object?.metadata?.name ?? null,
		Status: status,
		Roles: rolesDisplay,
		Age: object?.metadata?.creationTimestamp ?? null,
		Version: nodeInfo?.kubeletVersion ?? null,
		'Internal-IP': internalIP,
		'External-IP': externalIP,
		'OS-Image': nodeInfo?.osImage ?? null,
		'Kernel-Version': nodeInfo?.kernelVersion ?? null,
		'Container-Runtime': nodeInfo?.containerRuntimeVersion ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getNodeUISchemas(): Record<NodeAttribute, UISchemaType> {
	return {
		Name: 'link',
		Status: 'text',
		Roles: 'text',
		Age: 'time',
		Version: 'text',
		'Internal-IP': 'text',
		'External-IP': 'text',
		'OS-Image': 'text',
		'Kernel-Version': 'text',
		'Container-Runtime': 'text',
		raw: 'object'
	};
}

function getNodeColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<NodeAttribute, UISchemaType>,
	dataSchemas: Record<NodeAttribute, DataSchemaType>
): ColumnDef<Record<NodeAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: NodeAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<NodeAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<NodeAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<NodeAttribute, JsonValue>>;
			row: Row<Record<NodeAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<NodeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NodeAttribute, JsonValue>>;
				row: Row<Record<NodeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as NodeAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Status'),
		simpleColumn('Roles'),
		simpleColumn('Age'),
		simpleColumn('Version'),
		simpleColumn('Internal-IP', { class: 'hidden xl:table-cell' }),
		simpleColumn('External-IP', { class: 'hidden xl:table-cell' }),
		simpleColumn('OS-Image', { class: 'hidden xl:table-cell' }),
		simpleColumn('Kernel-Version', { class: 'hidden xl:table-cell' }),
		simpleColumn('Container-Runtime', { class: 'hidden xl:table-cell' })
	];
}

export { getNodeColumnDefinitions, getNodeData, getNodeDataSchemas, getNodeUISchemas };
