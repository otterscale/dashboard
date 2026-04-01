import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ModelOtterscaleIoV1Alpha1ModelService } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import type { QuantityMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/quantity-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

/** MB count → byte string for QuantityCell (`discrete`). */
function megabytesToByteQuantityString(mb: number): string {
	if (!Number.isFinite(mb) || mb < 0) {
		return String(mb);
	}
	const mbInt = BigInt(Math.round(mb));
	return String(mbInt * BigInt(1024) * BigInt(1024));
}

/**
 * Parse gpumem field: plain MB (`"24000"`) or compact SI (`"24K"` → 24_000 MB).
 * Anything else that looks like a Kubernetes quantity (e.g. `8Gi`, `512Mi`) is left to QuantityCell.
 */
function parseGpumemMbString(s: string): { mb: number } | 'kubernetesQuantity' | null {
	const t = s.trim();
	if (!t) {
		return null;
	}
	const compact = t.match(/^(\d+(?:\.\d+)?)\s*([kKmMgG])?$/);
	if (compact) {
		const base = Number(compact[1]);
		if (!Number.isFinite(base)) {
			return null;
		}
		const suf = (compact[2] ?? '').toUpperCase();
		if (!suf) {
			return { mb: base };
		}
		if (suf === 'K') {
			return { mb: base * 1_000 };
		}
		if (suf === 'M') {
			return { mb: base * 1_000_000 };
		}
		if (suf === 'G') {
			return { mb: base * 1_000_000_000 };
		}
	}
	if (/[a-zA-Z]/.test(t)) {
		return 'kubernetesQuantity';
	}
	return null;
}

/** `nvidia.com/gpumem` is specified in MB; quantity cells expect bytes. */
function gpumemMbToByteQuantity(mb: JsonValue): JsonValue {
	if (mb == null || mb === '') {
		return mb;
	}
	if (typeof mb === 'bigint') {
		return String(mb * BigInt(1024) * BigInt(1024));
	}
	if (typeof mb === 'number' && Number.isFinite(mb)) {
		return megabytesToByteQuantityString(mb);
	}
	if (typeof mb === 'string') {
		const s = mb.trim();
		if (!s) {
			return mb;
		}
		const parsed = parseGpumemMbString(s);
		if (parsed === 'kubernetesQuantity') {
			return mb;
		}
		if (parsed?.mb !== undefined) {
			return megabytesToByteQuantityString(parsed.mb);
		}
		const n = Number(s);
		if (!Number.isFinite(n)) {
			return mb;
		}
		return megabytesToByteQuantityString(n);
	}
	if (typeof mb === 'object' && mb !== null && 'value' in mb) {
		const inner = (mb as { value?: JsonValue }).value;
		if (inner !== undefined) {
			return gpumemMbToByteQuantity(inner);
		}
	}
	return mb;
}

/** JSON / protobuf map keys may use `nvidia.com/gpumem` or `nvidia_com_gpumem`. */
function gpumemMbFromResourceBlock(
	requests: Record<string, unknown> | undefined,
	limits: Record<string, unknown> | undefined
): JsonValue {
	const raw =
		requests?.['nvidia.com/gpumem'] ??
		requests?.['nvidia_com_gpumem'] ??
		limits?.['nvidia.com/gpumem'] ??
		limits?.['nvidia_com_gpumem'] ??
		null;
	return gpumemMbToByteQuantity(raw as JsonValue);
}

type ModelServiceAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model Name'
	| 'Status'
	| 'Decode Tensor'
	| 'Decode Replicas'
	| 'Decode GPU Memory'
	| 'Prefill Tensor'
	| 'Prefill Replicas'
	| 'Prefill GPU Memory'
	| 'Age'
	| 'raw';

function getModelServiceDataSchemas(): Record<ModelServiceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Model Name': 'text',
		Status: 'text',
		'Decode Tensor': 'object',
		'Decode Replicas': 'number',
		'Decode GPU Memory': 'quantity',
		'Prefill Tensor': 'object',
		'Prefill Replicas': 'number',
		'Prefill GPU Memory': 'quantity',
		Age: 'time',
		raw: 'object'
	};
}

function getModelServiceData(
	object: ModelOtterscaleIoV1Alpha1ModelService
): Record<ModelServiceAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Model Name': object?.spec?.model?.name ?? null,
		Status:
			readyCondition?.status === 'True'
				? 'Ready'
				: readyCondition?.status === 'False'
					? readyCondition.reason
					: '',
		'Decode Tensor': object?.spec?.decode?.parallelism?.tensor ?? null,
		'Decode Replicas': object?.spec?.decode?.replicas ?? null,
		'Decode GPU Memory': gpumemMbFromResourceBlock(
			object?.spec?.decode?.resources?.requests as Record<string, unknown> | undefined,
			object?.spec?.decode?.resources?.limits as Record<string, unknown> | undefined
		),
		'Prefill Tensor': object?.spec?.prefill?.parallelism?.tensor ?? null,
		'Prefill Replicas': object?.spec?.prefill?.replicas ?? null,
		'Prefill GPU Memory': gpumemMbFromResourceBlock(
			object?.spec?.prefill?.resources?.requests as Record<string, unknown> | undefined,
			object?.spec?.prefill?.resources?.limits as Record<string, unknown> | undefined
		),
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getModelServiceUISchemas(): Record<ModelServiceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Model Name': 'text',
		Status: 'text',
		'Decode Tensor': 'number',
		'Decode Replicas': 'number',
		'Decode GPU Memory': 'quantity',
		'Prefill Tensor': 'number',
		'Prefill Replicas': 'number',
		'Prefill GPU Memory': 'quantity',
		Age: 'time',
		raw: 'object'
	};
}

function getModelServiceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ModelServiceAttribute, UISchemaType>,
	dataSchemas: Record<ModelServiceAttribute, DataSchemaType>
): ColumnDef<Record<ModelServiceAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ModelServiceAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Model Name',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model Name'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Decode Tensor',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Decode Tensor'
		},
		{
			id: 'Decode Replicas',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Decode Replicas'
		},
		{
			id: 'Decode GPU Memory',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						type: 'discrete'
					} satisfies QuantityMetadata
				}),
			accessorKey: 'Decode GPU Memory'
		},
		{
			id: 'Prefill Tensor',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Prefill Tensor'
		},
		{
			id: 'Prefill Replicas',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Prefill Replicas'
		},
		{
			id: 'Prefill GPU Memory',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						type: 'discrete'
					} satisfies QuantityMetadata
				}),
			accessorKey: 'Prefill GPU Memory'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ModelServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModelServiceAttribute, JsonValue>>;
				row: Row<Record<ModelServiceAttribute, JsonValue>>;
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
	getModelServiceColumnDefinitions,
	getModelServiceData,
	getModelServiceDataSchemas,
	getModelServiceUISchemas
};
