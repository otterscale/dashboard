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
