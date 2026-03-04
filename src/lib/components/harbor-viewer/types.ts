export interface HarborProject {
	project_id: number;
	name: string;
	repo_count: number;
}

export interface HarborVulnerabilitySummary {
	total: number;
	fixable: number;
	critical: number;
	high: number;
	medium: number;
	low: number;
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
