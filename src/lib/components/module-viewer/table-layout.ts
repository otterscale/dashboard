import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import type { InstalledModule, ModuleType } from './types';

type ModuleAttribute =
	| 'Helm Repository'
	| 'Name'
	| 'Description'
	| 'Digest'
	| 'Latest Version'
	| 'Installed Version'
	| 'Type'
	| 'Labels'
	| 'Installed'
	| 'helmRepository'
	| 'chart'
	| 'icon'
	| 'annotations'
	| 'installedModules'
	| 'canUpdate';

function getChartDataSchemas(): Record<ModuleAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		Name: 'text',
		Description: 'text',
		Digest: 'text',
		'Latest Version': 'text',
		'Installed Version': 'text',
		Type: 'text',
		Labels: 'array',
		Installed: 'boolean',
		annotations: 'object',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object',
		installedModules: 'array',
		canUpdate: 'boolean'
	};
}

function getChartUISchemas(): Record<ModuleAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		Name: 'text',
		Description: 'text',
		Digest: 'text',
		'Latest Version': 'text',
		'Installed Version': 'text',
		Type: 'text',
		Labels: 'array',
		Installed: 'boolean',
		annotations: 'object',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object',
		installedModules: 'array',
		canUpdate: 'boolean'
	};
}
function getChartData(
	module: ModuleType,
	installedModules: InstalledModule[],
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ModuleAttribute, JsonValue> {
	const installedModuleNames = new Set(
		installedModules.map((installedModule) => installedModule.chart)
	);
	const installedModule = installedModules.find(
		(installedModule) => installedModule.chart === module.name
	);
	const installedVersion = installedModule?.version;
	const latestVersion = module.version;
	const canUpdate = installedVersion && latestVersion && installedVersion !== latestVersion;
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		Name: module.name ?? null,
		Description: module.description as JsonValue,
		Digest: module.digest ?? null,
		'Latest Version': module.version as JsonValue,
		'Installed Version': installedVersion as JsonValue,
		Type: module.type ?? null,
		Labels: (module.keywords ?? []) as JsonValue,
		Installed: installedModuleNames.has(module.name ?? ''),
		annotations: module?.annotations as JsonValue,
		icon: module.icon as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: module as unknown as JsonValue,
		installedModules: installedModules as unknown as JsonValue,
		canUpdate: canUpdate as JsonValue
	};
}

function getChartColumnDefinitions(
	uiSchemas: Record<ModuleAttribute, UISchemaType>,
	dataSchemas: Record<ModuleAttribute, DataSchemaType>
): ColumnDef<Record<ModuleAttribute, JsonValue>>[] {
	const columns: ModuleAttribute[] = [
		'Name',
		'Description',
		'Digest',
		'Type',
		'Latest Version',
		'Installed Version',
		'Labels',
		'Installed'
	];

	return columns.map((id) => {
		return {
			id,
			header: ({ column }: { column: Column<Record<ModuleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column,
					dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModuleAttribute, JsonValue>>;
				row: Row<Record<ModuleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas
				}),
			accessorKey: id
		};
	});
}

export {
	getChartColumnDefinitions,
	getChartData,
	getChartDataSchemas,
	getChartUISchemas,
	type ModuleAttribute
};
