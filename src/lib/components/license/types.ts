// Shared TypeScript interfaces for the license components

export interface NodeGPU {
	pciDeviceID: string;
	modelID?: string;
	count: number;
}

export interface NodeAuthorization {
	name: string;
	authorized: boolean;
	reason?: string;
	createdAt?: string;
	gpus?: NodeGPU[];
}

export interface GpuQuotaStatus {
	modelID: string;
	maxCards: number;
	authorizedCards: number;
}

export interface LicenseStatus {
	phase?: string;
	clusterFingerprintOK?: boolean;
	nodeCount?: number;
	maxNodes?: number;
	authorizedNodeCount?: number;
	selectionMode?: string;
	lastAcceptedAuthorizedNodes?: string[];
	gpuQuota?: GpuQuotaStatus[];
	nodeAuthorizations?: NodeAuthorization[];
	bindingRefreshedAt?: string;
	conditions?: Array<{ type: string; status: string; message?: string; reason?: string }>;
}

export interface LicenseSpec {
	token?: string;
	authorizedNodes?: string[];
}

export interface LicenseMeta {
	name?: string;
	resourceVersion?: string;
	creationTimestamp?: string;
}

export interface LicenseObject {
	apiVersion?: string;
	kind?: string;
	metadata?: LicenseMeta;
	spec?: LicenseSpec;
	status?: LicenseStatus;
}

export interface ClusterFingerprintStatus {
	clusterFingerprint?: string;
	kubeSystemUID?: string;
	lreqB64?: string;
	collectedAt?: string;
	conditions?: Array<{ type: string; status: string; message?: string }>;
}

export interface ClusterFingerprintObject {
	apiVersion?: string;
	kind?: string;
	metadata?: { name?: string; resourceVersion?: string };
	spec?: { exportRequest?: boolean };
	status?: ClusterFingerprintStatus;
}
