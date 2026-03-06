import { env as publicEnv } from '$env/dynamic/public';
import type {
	ArtifactType,
	ProjectType,
	RepositoryType
} from '$lib/components/artifact-viewer/types';

interface Options {
	path: string;
	responseType: 'json' | 'text' | 'auto';
	accessToken: string;
	headers: Record<string, string>;
}

async function retrieve<T = unknown>(options: Options): Promise<T> {
	const { path, accessToken, headers, responseType } = options;

	const endpoint = publicEnv.PUBLIC_HARBOR_URL;
	const url = new URL(path, endpoint);

	const defaultHeaders: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`
	};

	if (responseType === 'json') {
		defaultHeaders.Accept = 'application/json';
	}

	const response = await fetch(url.toString(), {
		headers: { ...defaultHeaders, ...headers }
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`Harbor API error: ${response.status} ${response.statusText}`, text);
		throw new Error(`Harbor API error: ${response.status} ${response.statusText}`);
	}

	switch (responseType) {
		case 'json':
			return response.json();

		case 'text':
			return response.text() as T;

		case 'auto': {
			const contentType = response.headers.get('content-type') ?? '';
			if (contentType.includes('application/json')) {
				return response.json();
			}
			return response.text() as T;
		}

		default:
			throw new Error(`Unsupported response type: ${responseType}`);
	}
}

export async function listProjects(accessToken: string): Promise<ProjectType[]> {
	const projects = await retrieve<ProjectType[]>({
		path: '/api/v2.0/projects',
		accessToken,
		responseType: 'json',
		headers: {}
	});

	return projects ?? [];
}

export async function listRepositories(
	projectName: string,
	accessToken: string
): Promise<RepositoryType[]> {
	if (!projectName) throw new Error('projectName is required');

	const repositories = await retrieve<RepositoryType[]>({
		path: `/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories`,
		accessToken,
		responseType: 'json',
		headers: {}
	});
	return repositories ?? [];
}

export async function listArtifacts(
	projectName: string,
	repositoryName: string,
	accessToken: string
): Promise<ArtifactType[]> {
	if (!projectName || !repositoryName)
		throw new Error('projectName and repositoryName are required');

	const artifacts = await retrieve<ArtifactType[]>({
		path: `/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repositoryName)}/artifacts?with_label=true`,
		accessToken,
		responseType: 'json',
		headers: {}
	});
	return artifacts ?? [];
}

export async function getReferenceAddition(
	projectName: string,
	repositoryName: string,
	reference: string,
	addition: string,
	accessToken: string
): Promise<string | Record<string, unknown>> {
	if (!projectName || !repositoryName || !reference || !addition)
		throw new Error('projectName, repositoryName, reference and addition are required');

	return retrieve<string | Record<string, unknown>>({
		path: `/api/v2.0/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repositoryName)}/artifacts/${encodeURIComponent(reference)}/additions/${encodeURIComponent(addition)}`,
		accessToken,
		responseType: 'auto',
		headers: {}
	});
}
