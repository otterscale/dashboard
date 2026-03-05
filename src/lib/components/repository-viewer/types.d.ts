interface ProjectType {
    project_id: number;
    name: string;
    repo_count: number;
}

interface RepositoryType {
    id: number;
    name: string;
    artifact_count: number;
    pull_count: number;
}

interface TagType {
    id: number;
    name: string;
    push_time?: string;
    pull_time?: string;
}

interface LabelType {
    id: number;
    name: string;
    color: string;
}

interface VulnerabilityType {
    total: number;
    fixable: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
}

interface RepositoryType {
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

export type { ProjectType, RepositoryType, TagType, LabelType, VulnerabilityType };