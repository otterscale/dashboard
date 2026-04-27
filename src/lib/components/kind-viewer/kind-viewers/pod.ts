import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Pod } from '@otterscale/types';
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

// Ref: https://github.com/kubernetes/kubernetes/blob/master/pkg/printers/internalversion/printers.go printPod()
function getPodStatus(object: CoreV1Pod): string {
	const initContainerStatuses = object?.status?.initContainerStatuses ?? [];
	const containerStatuses = object?.status?.containerStatuses ?? [];
	const initContainers = object?.spec?.initContainers ?? [];

	let reason: string = object?.status?.phase ?? 'Unknown';

	// Pod-level reason takes precedence over phase
	if (object?.status?.reason) {
		reason = object.status.reason;
	}

	// Check init containers
	let initializing = false;
	for (let i = 0; i < initContainerStatuses.length; i++) {
		const container = initContainerStatuses[i];
		if (container.state?.terminated?.exitCode === 0) {
			continue;
		} else if (container.state?.terminated) {
			const terminated = container.state.terminated;
			if (terminated.reason) {
				reason = `Init:${terminated.reason}`;
			} else if (terminated.signal) {
				reason = `Init:Signal:${terminated.signal}`;
			} else {
				reason = `Init:ExitCode:${terminated.exitCode}`;
			}
			initializing = true;
		} else if (
			container.state?.waiting?.reason &&
			container.state.waiting.reason !== 'PodInitializing'
		) {
			reason = `Init:${container.state.waiting.reason}`;
			initializing = true;
		} else {
			reason = `Init:${i}/${initContainers.length}`;
			initializing = true;
		}
		break;
	}

	// Check regular containers (iterate in reverse so last container wins, matching kubectl behaviour)
	if (!initializing) {
		let hasRunning = false;
		for (let i = containerStatuses.length - 1; i >= 0; i--) {
			const container = containerStatuses[i];
			if (container.state?.waiting?.reason) {
				reason = container.state.waiting.reason;
			} else if (container.state?.terminated?.reason) {
				reason = container.state.terminated.reason;
			} else if (container.state?.terminated) {
				const terminated = container.state.terminated;
				if (terminated.signal) {
					reason = `Signal:${terminated.signal}`;
				} else {
					reason = `ExitCode:${terminated.exitCode}`;
				}
			} else if (container.ready && container.state?.running) {
				hasRunning = true;
			}
		}

		// If all containers show "Completed" but at least one is still running, show Running/NotReady
		if (reason === 'Completed' && hasRunning) {
			const hasReadyCondition = (object?.status?.conditions ?? []).some(
				(c) => c.type === 'Ready' && c.status === 'True'
			);
			reason = hasReadyCondition ? 'Running' : 'NotReady';
		}
	}

	// deletionTimestamp overrides everything → Terminating (unless NodeLost)
	if (object?.metadata?.deletionTimestamp) {
		if (object?.status?.reason === 'NodeLost') {
			reason = 'Unknown';
		} else {
			reason = 'Terminating';
		}
	}

	return reason;
}

// kubectl get pod -o wide
// NAME   READY   STATUS   RESTARTS   AGE   IP   NODE   NOMINATED NODE   READINESS GATES
type PodAttribute =
	| 'Name'
	| 'Namespace'
	| 'Ready'
	| 'Status'
	| 'Restarts'
	| 'Age'
	| 'IP'
	| 'Node'
	| 'Nominated Node'
	| 'Readiness Gates'
	| 'raw';

function getPodDataSchemas(): Record<PodAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Ready: 'text',
		Status: 'text',
		Restarts: 'number',
		Age: 'time',
		IP: 'text',
		Node: 'text',
		'Nominated Node': 'text',
		'Readiness Gates': 'number',
		raw: 'object'
	};
}

function getPodData(object: CoreV1Pod): Record<PodAttribute, JsonValue> {
	const containerStatuses = object?.status?.containerStatuses ?? [];
	const totalContainers = object?.spec?.containers?.length ?? 0;
	const readyContainers = containerStatuses.filter((cs) => cs.ready).length;
	const totalRestarts = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0);
	const readinessGatesCount = object?.spec?.readinessGates?.length ?? 0;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Ready: `${readyContainers}/${totalContainers}`,
		Status: getPodStatus(object),
		Restarts: totalRestarts,
		Age: object?.metadata?.creationTimestamp ?? null,
		IP: object?.status?.podIP ?? null,
		Node: object?.spec?.nodeName ?? null,
		'Nominated Node': object?.status?.nominatedNodeName ?? null,
		'Readiness Gates': readinessGatesCount > 0 ? readinessGatesCount : null,
		raw: (object as JsonObject) ?? null
	};
}

function getPodUISchemas(): Record<PodAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Ready: 'text',
		Status: 'text',
		Restarts: 'text',
		Age: 'time',
		IP: 'text',
		Node: 'text',
		'Nominated Node': 'text',
		'Readiness Gates': 'array-of-object',
		raw: 'object'
	};
}

function getPodColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<PodAttribute, UISchemaType>,
	dataSchemas: Record<PodAttribute, DataSchemaType>
): ColumnDef<Record<PodAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as PodAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Restarts',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Restarts'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		},
		{
			id: 'IP',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'IP',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Node',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Node',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Nominated Node',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Nominated Node',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Readiness Gates',
			header: ({ column }: { column: Column<Record<PodAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<PodAttribute, JsonValue>>;
				row: Row<Record<PodAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: ((row.original.raw as CoreV1Pod).spec?.readinessGates ?? []).map((gate) => ({
							title: gate.conditionType,
							raw: gate
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Readiness Gates',
			meta: {
				class: 'hidden xl:table-cell'
			}
		}
	];
}

export { getPodColumnDefinitions, getPodData, getPodDataSchemas, getPodUISchemas };
