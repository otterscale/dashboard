import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';
import semver from 'semver';

import { env } from '$env/dynamic/public';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import type { ArtifactChartType } from './types';

type ChartAttribute =
	| 'Helm Repository'
	| 'Chart Name'
	| 'Description'
	| 'Digest'
	| 'Version'
	| 'Type'
	| 'Tier'
	| 'Incompatibility'
	| 'Labels'
	| 'icon'
	| 'helmRepository'
	| 'chart';

/** Validated tiered charts must match the platform's major.minor. UI guard only. */
const ChartTierAnnotation = 'aidp.phison.com/tier';
const ChartValidatedAgainstAnnotation = 'aidp.phison.com/validated-against';
function getAnnotation(artifactChart: ArtifactChartType, key: string): string | undefined {
	return (artifactChart.extra_attrs?.annotations as Record<string, string> | undefined)?.[key];
}
function isIncompatible(artifactChart: ArtifactChartType): string | null {
	if (!getAnnotation(artifactChart, ChartTierAnnotation)) return null;

	const platform = semver.coerce(env.PUBLIC_APP_VERSION);
	if (!platform) return null;

	const validated = semver.coerce(getAnnotation(artifactChart, ChartValidatedAgainstAnnotation));
	if (!validated) return null;

	if (validated.major === platform.major && validated.minor === platform.minor) return null;
	return `Validated for ${validated.major}.${validated.minor}, but current platform version is ${platform.major}.${platform.minor}`;
}

/** Harbor returns every OCI artifact under a repository; only chart configs are usable here. */
const HelmChartMediaType = 'application/vnd.cncf.helm.config.v1+json';
function isHelmChart(artifactChart: ArtifactChartType): boolean {
	return artifactChart.media_type === HelmChartMediaType;
}

/** Charts the UI is allowed to offer for install. */
function isInstallable(artifactChart: ArtifactChartType): boolean {
	return isHelmChart(artifactChart) && !isIncompatible(artifactChart);
}

function getChartDataSchemas(): Record<ChartAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Tier: 'text',
		Incompatibility: 'text',
		Labels: 'array',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartUISchemas(): Record<ChartAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Tier: 'text',
		Incompatibility: 'text',
		Labels: 'array',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object'
	};
}

function getChartDataFromHarbor(
	artifactChart: ArtifactChartType,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ChartAttribute, JsonValue> {
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		'Chart Name': artifactChart.repository_name ?? null,
		Description: artifactChart.extra_attrs?.description as JsonValue,
		Digest: artifactChart.digest ?? null,
		Version: artifactChart.extra_attrs?.version as JsonValue,
		Type: artifactChart.type ?? null,
		Tier: getAnnotation(artifactChart, ChartTierAnnotation) ?? null,
		Incompatibility: isIncompatible(artifactChart),
		Labels: (artifactChart.labels ?? []) as JsonValue,
		icon: artifactChart.extra_attrs?.icon as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: artifactChart as unknown as JsonValue
	};
}

function getChartColumnDefinitions(
	uiSchemas: Record<ChartAttribute, UISchemaType>,
	dataSchemas: Record<ChartAttribute, DataSchemaType>
): ColumnDef<Record<ChartAttribute, JsonValue>>[] {
	const columns: ChartAttribute[] = [
		'Chart Name',
		'Description',
		'Digest',
		'Type',
		'Version',
		'Labels',
		'Helm Repository'
	];

	return columns.map((id) => {
		return {
			id,
			header: ({ column }: { column: Column<Record<ChartAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column,
					dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ChartAttribute, JsonValue>>;
				row: Row<Record<ChartAttribute, JsonValue>>;
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
	type ChartAttribute,
	getChartColumnDefinitions,
	getChartDataFromHarbor,
	getChartDataSchemas,
	getChartUISchemas,
	isInstallable
};
