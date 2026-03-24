import type { ArtifactType } from '$lib/server/harbor';

interface HelmRepositoryChartVersion {
	name: string;
	version: string;
	appVersion?: string;
	created?: string;
	description?: string;
	digest?: string;
	home?: string;
	icon?: string;
	urls: string[];
}

interface HelmRepositoryChartArtifact {
	sourceType: 'helm-repository';
	repository_name: string;
	digest: string;
	size: number;
	push_time: string | null;
	pull_time: string | null;
	type: string;
	labels: Array<{ name: string }>;
	tags: Array<{ name: string }>;
	extra_attrs: {
		name: string;
		version: string;
		description?: string;
		icon?: string;
		app_version?: string;
		home?: string;
		created?: string;
		urls: string[];
	};
	versions: HelmRepositoryChartVersion[];
	raw?: Record<string, unknown>;
}

type ChartArtifact = ArtifactType | HelmRepositoryChartArtifact;

function isHelmRepositoryChartArtifact(
	chartArtifact: ChartArtifact
): chartArtifact is HelmRepositoryChartArtifact {
	return 'sourceType' in chartArtifact && chartArtifact.sourceType === 'helm-repository';
}

function createHelmRepositoryChartArtifact(
	chartName: string,
	version: HelmRepositoryChartVersion,
	versions: HelmRepositoryChartVersion[],
	raw?: Record<string, unknown>
): HelmRepositoryChartArtifact {
	return {
		sourceType: 'helm-repository',
		repository_name: chartName,
		digest: version.digest ?? '',
		size: 0,
		push_time: version.created ?? null,
		pull_time: null,
		type: 'helm',
		labels: [],
		tags: [],
		extra_attrs: {
			name: version.name,
			version: version.version,
			description: version.description,
			icon: version.icon,
			app_version: version.appVersion,
			home: version.home,
			created: version.created,
			urls: version.urls
		},
		versions,
		raw
	};
}

export {
	createHelmRepositoryChartArtifact,
	isHelmRepositoryChartArtifact,
	type ChartArtifact,
	type HelmRepositoryChartArtifact,
	type HelmRepositoryChartVersion
};
