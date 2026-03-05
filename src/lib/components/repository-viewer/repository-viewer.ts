import { type JsonValue } from '@bufbuild/protobuf';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';
import type { RepositoryType } from './types';


type RepositoryAttribute =
	| 'Repository'
	| 'Tag'
	| 'Digest'
	| 'Size'
	| 'Push Time'
	| 'Platform'
	| 'Labels'
	| 'Pull Count'
	| 'Vulnerabilities'
	| 'raw';

function getRepositoryDataSchemas(): Record<RepositoryAttribute, DataSchemaType> {
	return {
		Repository: 'text',
		Tag: 'text',
		Digest: 'text',
		Size: 'number',
		'Push Time': 'time',
		Platform: 'text',
		Labels: 'array',
		'Pull Count': 'number',
		Vulnerabilities: 'text',
		raw: 'object'
	};
}

function getRepositoryUISchemas(): Record<RepositoryAttribute, UISchemaType> {
	return {
		Repository: 'text',
		Tag: 'text',
		Digest: 'text',
		Size: 'number',
		'Push Time': 'time',
		Platform: 'text',
		Labels: 'array',
		'Pull Count': 'number',
		Vulnerabilities: 'text',
		raw: 'object'
	};
}

function getRepositoryData(image: RepositoryType): Record<RepositoryAttribute, JsonValue> {
	const vulnSummary = image.vulnerabilities
		? `C:${image.vulnerabilities.critical} H:${image.vulnerabilities.high} M:${image.vulnerabilities.medium} L:${image.vulnerabilities.low}`
		: null;

	const platformStr =
		image.platform?.os || image.platform?.architecture
			? `${image.platform?.os ?? ''}${image.platform?.os && image.platform?.architecture ? '/' : ''}${image.platform?.architecture ?? ''}`
			: null;

	return {
		Repository: image.repositoryName ?? null,
		Tag: image.tag ?? null,
		Digest: image.digest ? image.digest.slice(0, 19) : null,
		Size: image.sizeBytes ?? null,
		'Push Time': image.pushTime ?? null,
		Platform: platformStr,
		Labels: (image.labels ?? []) as JsonValue,
		'Pull Count': image.pullCount ?? 0,
		Vulnerabilities: vulnSummary,
		raw: image as unknown as JsonValue
	};
}

function getRepositoryColumnDefinitions(
	uiSchemas: Record<RepositoryAttribute, UISchemaType>,
	dataSchemas: Record<RepositoryAttribute, DataSchemaType>
): ColumnDef<Record<RepositoryAttribute, JsonValue>>[] {
	const columns: RepositoryAttribute[] = [
		'Repository',
		'Tag',
		'Digest',
		'Size',
		'Push Time',
		'Platform',
		'Labels',
		'Pull Count',
		'Vulnerabilities'
	];

	return columns.map((id) => ({
		id,
		header: ({ column }: { column: Column<Record<RepositoryAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, {
				column,
				dataSchemas
			}),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<RepositoryAttribute, JsonValue>>;
			row: Row<Record<RepositoryAttribute, JsonValue>>;
		}) =>
			renderComponent(DynamicTableCell, {
				row,
				column,
				uiSchemas
			}),
		accessorKey: id
	}));
}

export {
	getRepositoryColumnDefinitions,
	getRepositoryData,
	getRepositoryDataSchemas,
	getRepositoryUISchemas,
	type RepositoryAttribute
};
