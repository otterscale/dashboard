import { env } from '$env/dynamic/private';
import type { ProjectType, RepositoryType } from '$lib/components/repository-viewer/types';

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
