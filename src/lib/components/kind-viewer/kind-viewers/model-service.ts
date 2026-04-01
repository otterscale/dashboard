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

const BYTES_PER_MIB = BigInt(1024) * BigInt(1024);

const GPUMEM_JSON_KEYS = ['nvidia.com/gpumem', 'nvidia_com_gpumem'] as const;

/** SI suffix on gpumem strings → multiply MB by this to get total MB (`24K` → 24_000 MB). */
const GPUMEM_SI_MB: Record<string, number> = {
	K: 1_000,
	M: 1_000_000,
	G: 1_000_000_000
};

/** MB (scalar) → byte string for QuantityCell (`discrete`). */
function mbScalarToByteQuantityString(mb: number | bigint): string {
	if (typeof mb === 'bigint') {
		return String(mb * BYTES_PER_MIB);
	}
	if (!Number.isFinite(mb) || mb < 0) {
		return String(mb);
	}
	return String(BigInt(Math.round(mb)) * BYTES_PER_MIB);
}

/**
 * Plain / compact MB (`"24000"`, `"24K"`) → MB count. Kubernetes quantities (`8Gi`) → sentinel.
 */
function parseGpumemMbString(
	s: string
): { mb: number } | 'kubernetesQuantity' | null {
	const t = s.trim();
	if (!t) {
		return null;
	}
	const m = t.match(/^(\d+(?:\.\d+)?)\s*([kKmMgG])?$/);
	if (!m) {
		return /[a-zA-Z]/.test(t) ? 'kubernetesQuantity' : null;
	}
	const base = Number(m[1]);
	if (!Number.isFinite(base)) {
		return null;
	}
	const suf = (m[2] ?? '').toUpperCase();
	if (!suf) {
		return { mb: base };
	}
	const mult = GPUMEM_SI_MB[suf];
	return mult !== undefined ? { mb: base * mult } : null;
}

function gpumemStringToByteQuantity(s: string): JsonValue {
	const t = s.trim();
	if (!t) {
		return s;
	}
	const parsed = parseGpumemMbString(t);
	if (parsed === 'kubernetesQuantity') {
		return s;
	}
	if (parsed?.mb !== undefined) {
		return mbScalarToByteQuantityString(parsed.mb);
	}
	const n = Number(t);
	return Number.isFinite(n) ? mbScalarToByteQuantityString(n) : s;
}

/** `nvidia.com/gpumem` values are MB; QuantityCell expects bytes. */
function gpumemMbToByteQuantity(mb: JsonValue): JsonValue {
	if (mb == null || mb === '') {
		return mb;
	}
	switch (typeof mb) {
		case 'bigint':
			return mbScalarToByteQuantityString(mb);
		case 'number':
			return Number.isFinite(mb) ? mbScalarToByteQuantityString(mb) : mb;
		case 'string':
			return gpumemStringToByteQuantity(mb);
		case 'object':
			if (mb !== null && 'value' in mb) {
				const inner = (mb as { value?: JsonValue }).value;
				return inner !== undefined ? gpumemMbToByteQuantity(inner) : mb;
			}
			return mb;
		default:
			return mb;
	}
}

function gpumemMbFromResourceBlock(
	requests: Record<string, unknown> | undefined,
	limits: Record<string, unknown> | undefined
): JsonValue {
	for (const map of [requests, limits]) {
		if (!map) {
			continue;
		}
		for (const key of GPUMEM_JSON_KEYS) {
			const v = map[key];
			if (v != null) {
				return gpumemMbToByteQuantity(v as JsonValue);
			}
		}
	}
	return null;
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
