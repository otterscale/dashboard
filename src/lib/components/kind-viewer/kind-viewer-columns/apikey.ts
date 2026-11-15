import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import type { ApiKeyObject } from '$lib/components/api-keys/service';
import { createdBy, readyCondition } from '$lib/components/api-keys/service';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

type ApiKeyAttribute =
	| 'Name'
	| 'Key'
	| 'Client ID'
	| 'Created By'
	| 'Generation'
	| 'Status'
	| 'Reason'
	| 'Last Rotated'
	| 'Age'
	| 'raw';

function getApiKeyDataSchemas(): Record<ApiKeyAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Key: 'text',
		'Client ID': 'text',
		'Created By': 'text',
		Generation: 'number',
		Status: 'text',
		Reason: 'text',
		'Last Rotated': 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getApiKeyData(object: ApiKeyObject): Record<ApiKeyAttribute, JsonValue> {
	const ready = readyCondition(object);
	return {
		Name: object?.metadata?.name ?? null,
		Key: object?.status?.keyPrefix ? `${object.status.keyPrefix}…` : null,
		'Client ID': object?.status?.clientId ?? null,
		'Created By': createdBy(object) || null,
		Generation: object?.status?.keyGeneration ?? null,
		Status: ready?.status === 'True' ? 'Ready' : (ready?.reason ?? ''),
		Reason: ready?.reason ?? null,
		'Last Rotated': object?.status?.lastRotatedAt ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as unknown as JsonObject) ?? null
	};
}

function getApiKeyUISchemas(): Record<ApiKeyAttribute, UISchemaType> {
	return {
		Name: 'text',
		Key: 'text',
		'Client ID': 'text',
		'Created By': 'text',
		Generation: 'text',
		Status: 'text',
		Reason: 'text',
		'Last Rotated': 'time',
		Age: 'time',
		raw: 'object'
	};
}

function getApiKeyColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ApiKeyAttribute, UISchemaType>,
	dataSchemas: Record<ApiKeyAttribute, DataSchemaType>
): ColumnDef<Record<ApiKeyAttribute, JsonValue>>[] {
	void apiResource;

	const column = (
		id: ApiKeyAttribute,
		meta?: { defaultHidden: boolean }
	): ColumnDef<Record<ApiKeyAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<ApiKeyAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, {
				column: column,
				dataSchemas: dataSchemas
			}),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<ApiKeyAttribute, JsonValue>>;
			row: Row<Record<ApiKeyAttribute, JsonValue>>;
		}) =>
			renderComponent(DynamicTableCell, {
				row: row,
				column: column,
				uiSchemas: uiSchemas
			}),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		column('Name'),
		column('Key'),
		column('Client ID'),
		column('Created By'),
		column('Status'),
		column('Generation', { defaultHidden: true }),
		column('Reason', { defaultHidden: true }),
		column('Last Rotated'),
		column('Age', { defaultHidden: true })
	];
}

export { getApiKeyColumnDefinitions, getApiKeyData, getApiKeyDataSchemas, getApiKeyUISchemas };
