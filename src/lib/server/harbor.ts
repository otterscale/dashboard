import { env as publicEnv } from '$env/dynamic/public';
interface ProjectType {
	project_id: number;
	owner_id: number;
	name: string;
	registry_id: number;
	creation_time: string;
	update_time: string;
	deleted: boolean;
	owner_name: string;
	togglable: boolean;
	current_user_role_id: number;
	current_user_role_ids: number[];
	repo_count: number;
	metadata: {
		public: string;
		enable_content_trust: string;
		enable_content_trust_cosign: string;
		prevent_vul: string;
		severity: string;
		auto_scan: string;
		auto_sbom_generation: string;
		reuse_sys_cve_allowlist: string;
		retention_id: string;
		proxy_speed_kb: string;
		max_upstream_conn: string;
	};
	cve_allowlist: {
		id: number;
		project_id: number;
		expires_at: number;
		items: Array<{ cve_id: string }>;
		creation_time: string;
		update_time: string;
	};
}

interface RepositoryType {
	id: number;
	project_id: number;
	name: string;
	description: string;
	artifact_count: number;
	pull_count: number;
	creation_time: string;
	update_time: string;
}

interface ArtifactType {
	id: number;
	type: string;
	media_type: string;
	manifest_media_type: string;
	artifact_type: string;
	project_id: number;
	repository_id: number;
	repository_name: string;
	digest: string;
	size: number;
	icon: string;
	push_time: string;
	pull_time: string;
	extra_attrs: Record<string, unknown>;
	annotations: Record<string, string>;
	references: Array<{
		parent_id: number;
		child_id: number;
		child_digest: string;
		platform: {
			architecture: string;
			os: string;
			'os.version': string;
			'os.features': string[];
			variant: string;
		};
		annotations: Record<string, string>;
		urls: string[];
	}>;
	tags: Array<{
		id: number;
		repository_id: number;
		artifact_id: number;
		name: string;
		push_time: string;
		pull_time: string;
		immutable: boolean;
	}>;
	addition_links: Record<string, { href: string; absolute: boolean }>;
	labels: Array<{
		id: number;
		name: string;
		description: string;
		color: string;
		scope: string;
		project_id: number;
		creation_time: string;
		update_time: string;
	}>;
	scan_overview: Record<string, unknown>;
	sbom_overview: Record<string, unknown>;
	accessories: Array<{
		id: number;
		artifact_id: number;
		subject_artifact_id: number;
		subject_artifact_digest: string;
		subject_artifact_repo: string;
		size: number;
		digest: string;
		type: string;
		icon: string;
		creation_time: string;
	}>;
}

export type { ArtifactType, ProjectType, RepositoryType };

interface Options {
	path: string;
	responseType: 'json' | 'text' | 'auto';
	accessToken: string;
	headers: Record<string, string>;
}

function encodeURIComponentWithSlashEscape(url: string): string {
	return url.includes('/') ? encodeURIComponent(encodeURIComponent(url)) : encodeURIComponent(url);
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
		path: `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/repositories`,
		accessToken,
		responseType: 'json',
		headers: {}
	});

	return repositories ?? [];
}

export async function getLatestArtifact(
	projectName: string,
	repositoryName: string,
	accessToken: string
): Promise<ArtifactType> {
	if (!projectName || !repositoryName)
		throw new Error('projectName and repositoryName are required');

	const artifact = await retrieve<ArtifactType>({
		path: `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/repositories/${encodeURIComponentWithSlashEscape(repositoryName)}/artifacts?sort=-push_time&page=1&page_size=1`,
		accessToken,
		responseType: 'json',
		headers: {}
	});
	return artifact ?? {};
}

export async function listArtifacts(
	projectName: string,
	repositoryName: string,
	accessToken: string
): Promise<ArtifactType[]> {
	if (!projectName || !repositoryName)
		throw new Error('projectName and repositoryName are required');

	const artifacts = await retrieve<ArtifactType[]>({
		path: `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/repositories/${encodeURIComponentWithSlashEscape(repositoryName)}/artifacts?with_label=true`,
		accessToken,
		responseType: 'json',
		headers: {}
	});
	return artifacts ?? [];
}

export async function listAllLatestArtifacts(
	projectName: string,
	accessToken: string
): Promise<ArtifactType[]> {
	if (!projectName) throw new Error('projectName is required');

	const artifacts = await retrieve<ArtifactType[]>({
		path: `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/artifacts?q=${encodeURIComponentWithSlashEscape('media_type=application/vnd.cncf.helm.config.v1+json')}&latest_in_repository=true`,
		accessToken,
		responseType: 'json',
		headers: {}
	});
	return artifacts ?? [];
}

export async function listModelArtifacts(
	projectName: string,
	accessToken: string
): Promise<ArtifactType[]> {
	const modelArtifacts: ArtifactType[] = [];

	try {
		const repositories = await listRepositories(projectName, accessToken);

		for (const repository of repositories) {
			const [projectName, ...repositoryName] = repository.name.split('/');

			const artifacts = await listArtifacts(projectName, repositoryName.join('/'), accessToken);

			modelArtifacts.push(...artifacts.filter((artifact) => artifact.type === 'MODEL'));
		}
	} catch (error) {
		console.error('Fail to fetch models:', error);
		throw error;
	}

	return modelArtifacts;
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
		path: `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/repositories/${encodeURIComponentWithSlashEscape(repositoryName)}/artifacts/${encodeURIComponentWithSlashEscape(reference)}/additions/${encodeURIComponentWithSlashEscape(addition)}`,
		accessToken,
		responseType: 'auto',
		headers: {}
	});
}
