import { env as publicEnv } from '$env/dynamic/public';
import type {
	ArtifactType,
	ProjectType,
	RepositoryType
} from '$lib/components/artifact-viewer/types';

async function fetchData<Type>(path: string, accessToken: string): Promise<Type> {
	const endpoint = publicEnv.PUBLIC_HARBOR_URL;
	const url = new URL(path, endpoint);

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${accessToken}`,
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

export async function listProjects(accessToken: string): Promise<ProjectType[]> {
	const projects = await fetchData<ProjectType[]>('/api/v2.0/projects', accessToken);

	return projects ?? [];
}

export async function listRepositories(
	projectName: string,
	accessToken: string
): Promise<RepositoryType[]> {
	if (!projectName) throw new Error('projectName is required');

	const repositories = await fetchData<RepositoryType[]>(
		`/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories`,
		accessToken
	);
	return repositories ?? [];
}

export async function listArtifacts(
	projectName: string,
	repositoryName: string,
	accessToken: string
): Promise<ArtifactType[]> {
	if (!projectName || !repositoryName)
		throw new Error('projectName and repositoryName are required');

	const artifacts = await fetchData<any[]>(
		`/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repositoryName)}/artifacts?with_label=true`,
		accessToken
	);
	return artifacts ?? [];
}

export async function getReferenceAddition(
	projectName: string,
	repositoryName: string,
	reference: string,
	addition: string,
	accessToken: string
): Promise<unknown> {
	if (!projectName || !repositoryName || !reference || !addition)
		throw new Error('projectName, repositoryName, reference and addition are required');

	const endpoint = publicEnv.PUBLIC_HARBOR_URL;
	const path = `/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repositoryName)}/artifacts/${encodeURIComponent(reference)}/additions/${addition}`;
	const url = new URL(path, endpoint);

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`Harbor API error: ${response.status} ${response.statusText}`, text);
		throw new Error(`Harbor API error: ${response.status} ${response.statusText}`);
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		return response.json();
	}
	return response.text();
}
