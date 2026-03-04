import { env } from '$env/dynamic/private';

export interface HarborProject {
	project_id: number;
	name: string;
	repo_count: number;
}

export interface HarborRepository {
	id: number;
	name: string;
	artifact_count: number;
	pull_count: number;
}

export interface HarborTag {
	id: number;
	name: string;
	push_time?: string;
	pull_time?: string;
}

export interface HarborLabel {
	id: number;
	name: string;
	color: string;
}

export interface HarborVulnerabilitySummary {
	total: number;
	fixable: number;
	critical: number;
	high: number;
	medium: number;
	low: number;
}

export interface HarborArtifact {
	id: number;
	digest: string;
	size: number;
	push_time?: string;
	pull_time?: string;
	tags?: HarborTag[] | null;
	labels?: HarborLabel[] | null;
	extra_attrs?: {
		architecture?: string;
		os?: string;
	} | null;
	scan_overview?: Record<
		string,
		{
			severity?: string;
			summary?: HarborVulnerabilitySummary;
		}
	> | null;
}

export interface HarborImage {
	projectName: string;
	repositoryName: string;
	tag: string | null;
	digest: string;
	sizeBytes: number;
	pushTime: string | null;
	platform: { os: string | null; architecture: string | null } | null;
	labels: string[];
	pullCount: number;
	vulnerabilities: HarborVulnerabilitySummary | null;
}

function getHarborConfig() {
	const url = env.HARBOR_URL;
	const robotName = env.HARBOR_ROBOT_NAME;
	const robotSecret = env.HARBOR_ROBOT_SECRET;

	if (!url || !robotName || !robotSecret) {
		console.error('Missing Harbor env:', {
			HARBOR_URL: !!url,
			HARBOR_ROBOT_NAME: !!robotName,
			HARBOR_ROBOT_SECRET: !!robotSecret
		});
		throw new Error('Harbor environment variables are not configured');
	}

	return { url: url.replace(/\/+$/, ''), robotName, robotSecret };
}

function getAuthHeader(robotName: string, robotSecret: string): string {
	return 'Basic ' + Buffer.from(`${robotName}:${robotSecret}`).toString('base64');
}

async function harborFetch<T>(path: string): Promise<T> {
	const { url, robotName, robotSecret } = getHarborConfig();

	const response = await fetch(`${url}${path}`, {
		headers: {
			Authorization: getAuthHeader(robotName, robotSecret),
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`Harbor API error: ${response.status} ${response.statusText}`, text);
		throw new Error(`Harbor API error: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function listProjects(): Promise<HarborProject[]> {
	const projects = await harborFetch<HarborProject[]>('/api/v2.0/projects?page_size=100&page=1');
	return projects ?? [];
}

export async function listRepositories(projectName: string): Promise<HarborRepository[]> {
	if (!projectName) throw new Error('projectName is required');

	const repos = await harborFetch<HarborRepository[]>(
		`/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories?page_size=100&page=1`
	);
	return repos ?? [];
}

export async function listArtifacts(
	projectName: string,
	repositoryName: string
): Promise<HarborArtifact[]> {
	if (!projectName || !repositoryName) throw new Error('projectName and repositoryName required');

	// repositoryName from Harbor includes the project prefix (e.g. "project/repo")
	// We need just the repo part after the project name
	const repoPath = repositoryName.startsWith(`${projectName}/`)
		? repositoryName.slice(projectName.length + 1)
		: repositoryName;

	const artifacts = await harborFetch<HarborArtifact[]>(
		`/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repoPath)}/artifacts?page_size=100&page=1&with_label=true&with_scan_overview=true&with_tag=true`
	);
	return artifacts ?? [];
}

function extractVulnerabilities(
	scanOverview: HarborArtifact['scan_overview']
): HarborVulnerabilitySummary | null {
	if (!scanOverview) return null;

	// scan_overview keys are mime types like "application/vnd.security.vulnerability.report; version=1.1"
	const report = Object.values(scanOverview)[0];
	return report?.summary ?? null;
}

export async function listImages(projectName: string): Promise<HarborImage[]> {
	const repos = await listRepositories(projectName);
	const images: HarborImage[] = [];

	for (const repo of repos) {
		let artifacts: HarborArtifact[];
		try {
			artifacts = await listArtifacts(projectName, repo.name);
		} catch (error) {
			console.error(`Failed to list artifacts for ${repo.name}:`, error);
			continue;
		}

		for (const artifact of artifacts) {
			const tags = artifact.tags ?? [];

			if (tags.length === 0) {
				// Untagged artifact
				images.push({
					projectName,
					repositoryName: repo.name,
					tag: null,
					digest: artifact.digest,
					sizeBytes: artifact.size,
					pushTime: artifact.push_time ?? null,
					platform: artifact.extra_attrs
						? {
								os: artifact.extra_attrs.os ?? null,
								architecture: artifact.extra_attrs.architecture ?? null
							}
						: null,
					labels: (artifact.labels ?? []).map((l) => l.name),
					pullCount: repo.pull_count ?? 0,
					vulnerabilities: extractVulnerabilities(artifact.scan_overview)
				});
			} else {
				for (const tag of tags) {
					images.push({
						projectName,
						repositoryName: repo.name,
						tag: tag.name,
						digest: artifact.digest,
						sizeBytes: artifact.size,
						pushTime: tag.push_time ?? artifact.push_time ?? null,
						platform: artifact.extra_attrs
							? {
									os: artifact.extra_attrs.os ?? null,
									architecture: artifact.extra_attrs.architecture ?? null
								}
							: null,
						labels: (artifact.labels ?? []).map((l) => l.name),
						pullCount: repo.pull_count ?? 0,
						vulnerabilities: extractVulnerabilities(artifact.scan_overview)
					});
				}
			}
		}
	}

	return images;
}
