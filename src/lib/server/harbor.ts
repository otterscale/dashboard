import { env } from '$env/dynamic/private';

export interface ProjectType {
	project_id: number;
	name: string;
	repo_count: number;
}

export interface RepositoryType {
	id: number;
	name: string;
	artifact_count: number;
	pull_count: number;
}

export interface TagType {
	id: number;
	name: string;
	push_time?: string;
	pull_time?: string;
}

export interface LabelType {
	id: number;
	name: string;
	color: string;
}

export interface VulnerabilityType {
	total: number;
	fixable: number;
	critical: number;
	high: number;
	medium: number;
	low: number;
}

export interface RepositoryType {
	projectName: string;
	repositoryName: string;
	tag: string | null;
	digest: string;
	sizeBytes: number;
	pushTime: string | null;
	platform: { os: string | null; architecture: string | null } | null;
	labels: string[];
	pullCount: number;
	vulnerabilities: VulnerabilityType | null;
}

async function fetchData<T>(path: string): Promise<T> {
	const url = env.HARBOR_URL;

	const robotName = env.HARBOR_ROBOT_NAME;
	const robotSecret = env.HARBOR_ROBOT_SECRET;

	const response = await fetch(`${url}${path}`, {
		headers: {
			Authorization: 'Basic ' + Buffer.from(`${robotName}:${robotSecret}`).toString('base64'),
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

export async function listProjects(): Promise<ProjectType[]> {
	const projects = await fetchData<ProjectType[]>('/api/v2.0/projects?page_size=100&page=1');
	return projects ?? [];
}

export async function listRepositories(projectName: string): Promise<RepositoryType[]> {
	if (!projectName) throw new Error('projectName is required');

	const repositories = await fetchData<RepositoryType[]>(
		`/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories?page_size=100&page=1`
	);
	return repositories ?? [];
}
