/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';

import { formatDescribe, formatPodDescribe } from './describe-formatter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a specific line from formatted output by label prefix. */
function getLine(output: string, label: string): string | undefined {
	return output.split('\n').find((l) => l.trimStart().startsWith(label));
}

/** Check output contains all listed substrings. */
function containsAll(output: string, ...needles: string[]) {
	for (const n of needles) {
		expect(output, `missing: "${n}"`).toContain(n);
	}
}

// ---------------------------------------------------------------------------
// Fixtures — minimal Kubernetes resources
// ---------------------------------------------------------------------------

const minimalPod: any = {
	apiVersion: 'v1',
	kind: 'Pod',
	metadata: { name: 'test-pod', namespace: 'default', labels: { app: 'web' } },
	spec: {
		containers: [
			{
				name: 'nginx',
				image: 'nginx:1.25',
				ports: [{ containerPort: 80, protocol: 'TCP' }]
			}
		]
	},
	status: {
		phase: 'Running',
		containerStatuses: [
			{
				name: 'nginx',
				ready: true,
				restartCount: 0,
				image: 'nginx:1.25',
				imageID: 'docker://sha256:abc123',
				state: { running: { startedAt: '2025-01-01T00:00:00Z' } }
			}
		]
	}
};

const deployment: any = {
	apiVersion: 'apps/v1',
	kind: 'Deployment',
	metadata: {
		name: 'web-deploy',
		namespace: 'production',
		labels: { app: 'web', tier: 'frontend' },
		annotations: { 'deployment.kubernetes.io/revision': '3' },
		creationTimestamp: '2025-06-15T10:30:00Z',
		generation: 5,
		resourceVersion: '123456',
		uid: 'abc-def-123'
	},
	spec: {
		replicas: 3,
		selector: { matchLabels: { app: 'web' } },
		template: {
			metadata: { labels: { app: 'web' } },
			spec: {
				containers: [{ name: 'nginx', image: 'nginx:1.25' }]
			}
		},
		strategy: {
			type: 'RollingUpdate',
			rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' }
		}
	},
	status: {
		availableReplicas: 3,
		readyReplicas: 3,
		replicas: 3,
		conditions: [
			{
				type: 'Available',
				status: 'True',
				lastTransitionTime: '2025-06-15T10:32:00Z',
				reason: 'MinimumReplicasAvailable'
			}
		]
	}
};

const service: any = {
	apiVersion: 'v1',
	kind: 'Service',
	metadata: {
		name: 'my-service',
		namespace: 'default',
		labels: { app: 'web' }
	},
	spec: {
		type: 'ClusterIP',
		clusterIP: '10.96.0.1',
		ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
		selector: { app: 'web' }
	}
};

const configMap: any = {
	apiVersion: 'v1',
	kind: 'ConfigMap',
	metadata: {
		name: 'app-config',
		namespace: 'default'
	},
	data: {
		'config.yaml': 'key: value\nother: data',
		LOG_LEVEL: 'info'
	}
};

const customResource: any = {
	apiVersion: 'tenant.otterscale.io/v1alpha1',
	kind: 'Workspace',
	metadata: {
		name: 'woody',
		namespace: '',
		labels: { 'user.otterscale.io/woody': 'true' },
		annotations: null,
		creationTimestamp: '2025-01-20T03:45:00Z',
		generation: 1,
		resourceVersion: '99999',
		uid: 'ws-uid-123'
	},
	spec: {
		members: [{ role: 'owner', user: 'woody' }],
		namespace: 'ws-woody',
		networkIsolation: true,
		resourceQuota: { cpu: '4', memory: '8Gi' }
	},
	status: {
		conditions: [
			{
				lastTransitionTime: '2025-01-20T03:45:05Z',
				message: '',
				reason: 'Ready',
				status: 'True',
				type: 'Ready'
			}
		],
		namespaceRef: { name: 'ws-woody' },
		phase: 'Active'
	}
};

const clusterScopedResource: any = {
	apiVersion: 'rbac.authorization.k8s.io/v1',
	kind: 'ClusterRole',
	metadata: {
		name: 'admin-role',
		labels: { 'rbac.io/aggregate-to-admin': 'true' }
	},
	rules: [
		{
			apiGroups: [''],
			resources: ['pods', 'services'],
			verbs: ['get', 'list', 'watch']
		}
	]
};

const sampleEvents = [
	{
		type: 'Normal',
		reason: 'Scheduled',
		metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
		source: { component: 'default-scheduler' },
		message: 'Successfully assigned default/test-pod to node-1',
		reportingComponent: '',
		involvedObject: {}
	},
	{
		type: 'Normal',
		reason: 'Pulled',
		metadata: { creationTimestamp: '2025-01-01T00:00:05Z' },
		source: { component: 'kubelet' },
		message: 'Container image "nginx:1.25" already present on machine',
		reportingComponent: '',
		involvedObject: {}
	}
];

// =========================================================================
// Tests
// =========================================================================

describe('formatDescribe — routing', () => {
	it('routes Pod to the Pod-specific formatter', () => {
		const output = formatDescribe(minimalPod);
		// Pod-specific fields that only appear in formatPodDescribe
		containsAll(output, 'Containers:', 'nginx:', 'Image:', 'QoS Class');
	});

	it('routes non-Pod resources to the generic formatter', () => {
		const output = formatDescribe(deployment);
		containsAll(output, 'Name:', 'Namespace:', 'API Version:', 'Kind:');
		// Should NOT contain Pod-specific fields
		expect(output).not.toContain('QoS Class');
		expect(output).not.toContain('Service Account');
	});
});

describe('formatDescribe — generic resources', () => {
	describe('Deployment', () => {
		const output = formatDescribe(deployment, sampleEvents);

		it('renders Name and Namespace', () => {
			expect(getLine(output, 'Name:')).toContain('web-deploy');
			expect(getLine(output, 'Namespace:')).toContain('production');
		});

		it('renders Labels', () => {
			containsAll(output, 'app=web', 'tier=frontend');
		});

		it('renders Annotations', () => {
			expect(output).toContain('deployment.kubernetes.io/revision: 3');
		});

		it('renders API Version and Kind', () => {
			expect(getLine(output, 'API Version:')).toContain('apps/v1');
			expect(getLine(output, 'Kind:')).toContain('Deployment');
		});

		it('renders Metadata (remaining fields) with Title Case', () => {
			containsAll(output, 'Creation Timestamp:', 'Generation:', 'Resource Version:', 'Uid:');
		});

		it('renders Spec section as tree', () => {
			containsAll(output, 'Spec:', 'Replicas:', 'Selector:', 'Strategy:');
		});

		it('renders Status section as tree', () => {
			containsAll(output, 'Status:', 'Available Replicas:', 'Ready Replicas:');
		});

		it('renders Events table', () => {
			containsAll(output, 'Events:', 'Scheduled', 'Pulled', 'default-scheduler', 'kubelet');
		});
	});

	describe('Service', () => {
		const output = formatDescribe(service);

		it('renders all core fields', () => {
			containsAll(output, 'Name:', 'my-service', 'Namespace:', 'default');
		});

		it('renders Spec with nested details', () => {
			containsAll(output, 'Type:', 'ClusterIP', 'Cluster IP:', '10.96.0.1');
		});

		it('shows <none> for missing annotations', () => {
			expect(getLine(output, 'Annotations:')).toContain('<none>');
		});
	});

	describe('ConfigMap', () => {
		const output = formatDescribe(configMap);

		it('renders data keys', () => {
			// toTitleCase capitalizes first char of dotted keys
			containsAll(output, 'Data:', 'Config.yaml:', 'LOG_LEVEL:');
		});
	});

	describe('Custom Resource (Workspace CRD)', () => {
		const output = formatDescribe(customResource);

		it('renders Name', () => {
			expect(getLine(output, 'Name:')).toContain('woody');
		});

		it('renders Labels with custom domain', () => {
			expect(output).toContain('user.otterscale.io/woody=true');
		});

		it('renders Annotations as <none> when null', () => {
			expect(getLine(output, 'Annotations:')).toContain('<none>');
		});

		it('renders API Version for CRD', () => {
			expect(getLine(output, 'API Version:')).toContain('tenant.otterscale.io/v1alpha1');
		});

		it('renders Kind', () => {
			expect(getLine(output, 'Kind:')).toContain('Workspace');
		});

		it('renders Spec with members, namespace, network isolation', () => {
			containsAll(output, 'Spec:', 'Members:', 'Network Isolation:');
		});

		it('renders Status with conditions and phase', () => {
			containsAll(output, 'Status:', 'Conditions:', 'Phase:');
		});

		it('renders Events section even without events', () => {
			expect(output).toContain('Events:');
			// No events → shows <none>
			expect(output).toContain('<none>');
		});
	});

	describe('Cluster-scoped resource (ClusterRole)', () => {
		const output = formatDescribe(clusterScopedResource);

		it('renders Name', () => {
			expect(getLine(output, 'Name:')).toContain('admin-role');
		});

		it('renders Namespace as empty (cluster-scoped)', () => {
			const nsLine = getLine(output, 'Namespace:');
			expect(nsLine).toBeDefined();
			// Namespace should be empty — not missing
			expect(nsLine!.replace('Namespace:', '').trim()).toBe('');
		});

		it('renders Labels', () => {
			expect(output).toContain('rbac.io/aggregate-to-admin=true');
		});

		it('renders Rules section as tree', () => {
			containsAll(output, 'Rules:');
		});
	});
});

describe('formatDescribe — edge cases', () => {
	it('handles completely empty resource', () => {
		const output = formatDescribe({});
		expect(output).toContain('Name:');
		expect(output).toContain('Events:');
	});

	it('handles resource with only metadata', () => {
		const output = formatDescribe({
			apiVersion: 'v1',
			kind: 'Secret',
			metadata: { name: 'my-secret', namespace: 'default' }
		});
		containsAll(output, 'Name:', 'my-secret', 'Kind:', 'Secret');
	});

	it('handles deeply nested objects', () => {
		const output = formatDescribe({
			kind: 'DeepResource',
			metadata: { name: 'deep' },
			spec: {
				level1: {
					level2: {
						level3: {
							value: 'deep-value'
						}
					}
				}
			}
		});
		expect(output).toContain('deep-value');
	});

	it('handles arrays of scalars', () => {
		const output = formatDescribe({
			kind: 'ArrayResource',
			metadata: { name: 'arr' },
			spec: {
				items: ['a', 'b', 'c']
			}
		});
		containsAll(output, 'a', 'b', 'c');
	});

	it('handles arrays of objects', () => {
		const output = formatDescribe({
			kind: 'ArrayObjResource',
			metadata: { name: 'arrobj' },
			spec: {
				containers: [
					{ name: 'c1', image: 'img1' },
					{ name: 'c2', image: 'img2' }
				]
			}
		});
		containsAll(output, 'c1', 'img1', 'c2', 'img2');
	});

	it('handles null and undefined values', () => {
		const output = formatDescribe({
			kind: 'NullResource',
			metadata: { name: 'nulls' },
			spec: {
				nullField: null,
				undefinedField: undefined,
				emptyObj: {},
				emptyArr: []
			}
		});
		expect(output).toContain('<nil>');
		expect(output).toContain('<none>');
	});

	it('handles boolean and numeric values', () => {
		const output = formatDescribe({
			kind: 'TypeResource',
			metadata: { name: 'types' },
			spec: {
				enabled: true,
				count: 42,
				ratio: 3.14,
				disabled: false
			}
		});
		containsAll(output, 'true', '42', '3.14', 'false');
	});

	it('handles events being undefined', () => {
		const output = formatDescribe(deployment);
		expect(output).toContain('Events:');
	});

	it('handles events being empty array', () => {
		const output = formatDescribe(deployment, []);
		expect(output).toContain('Events:');
		expect(output).toContain('<none>');
	});
});

describe('formatDescribe — camelCase to Title Case', () => {
	it('converts camelCase keys', () => {
		const output = formatDescribe({
			kind: 'CamelResource',
			metadata: { name: 'camel', creationTimestamp: '2025-01-01T00:00:00Z' }
		});
		expect(output).toContain('Creation Timestamp:');
	});

	it('converts PascalCase / acronym keys', () => {
		const output = formatDescribe({
			kind: 'TestRes',
			metadata: { name: 'test' },
			spec: { apiServerURL: 'https://example.com', clusterIP: '10.0.0.1' }
		});
		// Leading lowercase acronyms get first-char capitalized only
		containsAll(output, 'Api Server URL:', 'Cluster IP:');
	});
});

describe('formatPodDescribe — Pod-specific fields', () => {
	it('contains all major Pod sections', () => {
		const output = formatPodDescribe(minimalPod, sampleEvents);
		containsAll(
			output,
			'Name:',
			'Namespace:',
			'Containers:',
			'nginx:',
			'Image:',
			'QoS Class:',
			'Events:'
		);
	});

	it('renders container ports', () => {
		const output = formatPodDescribe(minimalPod);
		expect(output).toContain('80/TCP');
	});

	it('renders container state', () => {
		const output = formatPodDescribe(minimalPod);
		expect(output).toContain('Running');
	});

	it('renders events table with headers', () => {
		const output = formatPodDescribe(minimalPod, sampleEvents);
		containsAll(output, 'Type', 'Reason', 'Message');
	});

	it('handles Pod with init containers', () => {
		const podWithInit = {
			...minimalPod,
			spec: {
				...minimalPod.spec,
				initContainers: [{ name: 'init-db', image: 'busybox:latest' }]
			},
			status: {
				...minimalPod.status,
				initContainerStatuses: [
					{
						name: 'init-db',
						ready: false,
						restartCount: 0,
						image: 'busybox:latest',
						state: {
							terminated: { exitCode: 0, reason: 'Completed' }
						}
					}
				]
			}
		};
		const output = formatPodDescribe(podWithInit);
		containsAll(output, 'Init Containers:', 'init-db:');
	});

	it('handles Pod with volumes', () => {
		const podWithVolumes = {
			...minimalPod,
			spec: {
				...minimalPod.spec,
				volumes: [
					{ name: 'config-vol', configMap: { name: 'app-config' } },
					{ name: 'secret-vol', secret: { secretName: 'app-secret' } },
					{ name: 'empty-vol', emptyDir: {} }
				]
			}
		};
		const output = formatPodDescribe(podWithVolumes);
		containsAll(output, 'Volumes:', 'config-vol:', 'secret-vol:', 'empty-vol:');
	});

	it('handles Pod with tolerations', () => {
		const podWithTolerations = {
			...minimalPod,
			spec: {
				...minimalPod.spec,
				tolerations: [
					{
						key: 'node.kubernetes.io/not-ready',
						operator: 'Exists',
						effect: 'NoExecute',
						tolerationSeconds: 300
					}
				]
			}
		};
		const output = formatPodDescribe(podWithTolerations);
		expect(output).toContain('Tolerations:');
		expect(output).toContain('node.kubernetes.io/not-ready');
	});
});

describe('formatDescribe — real-world resource types', () => {
	it('handles Namespace resource', () => {
		const ns: any = {
			apiVersion: 'v1',
			kind: 'Namespace',
			metadata: {
				name: 'kube-system',
				labels: { 'kubernetes.io/metadata.name': 'kube-system' }
			},
			spec: { finalizers: ['kubernetes'] },
			status: { phase: 'Active' }
		};
		const output = formatDescribe(ns);
		containsAll(output, 'Name:', 'kube-system', 'Kind:', 'Namespace', 'Phase:', 'Active');
	});

	it('handles PersistentVolumeClaim', () => {
		const pvc: any = {
			apiVersion: 'v1',
			kind: 'PersistentVolumeClaim',
			metadata: { name: 'data-pvc', namespace: 'default' },
			spec: {
				accessModes: ['ReadWriteOnce'],
				resources: { requests: { storage: '10Gi' } },
				storageClassName: 'fast-ssd'
			},
			status: { phase: 'Bound', capacity: { storage: '10Gi' } }
		};
		const output = formatDescribe(pvc);
		containsAll(output, 'Name:', 'data-pvc', 'Access Modes:', 'Storage Class Name:', 'Bound');
	});

	it('handles Ingress', () => {
		const ingress: any = {
			apiVersion: 'networking.k8s.io/v1',
			kind: 'Ingress',
			metadata: {
				name: 'web-ingress',
				namespace: 'default',
				annotations: { 'nginx.ingress.kubernetes.io/rewrite-target': '/' }
			},
			spec: {
				ingressClassName: 'nginx',
				rules: [
					{
						host: 'example.com',
						http: {
							paths: [
								{
									path: '/',
									pathType: 'Prefix',
									backend: { service: { name: 'web-svc', port: { number: 80 } } }
								}
							]
						}
					}
				]
			}
		};
		const output = formatDescribe(ingress);
		containsAll(output, 'Name:', 'web-ingress', 'Ingress Class Name:', 'nginx', 'example.com');
	});

	it('handles StatefulSet', () => {
		const sts: any = {
			apiVersion: 'apps/v1',
			kind: 'StatefulSet',
			metadata: { name: 'db-sts', namespace: 'default' },
			spec: {
				replicas: 3,
				serviceName: 'db-headless',
				selector: { matchLabels: { app: 'db' } },
				volumeClaimTemplates: [
					{
						metadata: { name: 'data' },
						spec: {
							accessModes: ['ReadWriteOnce'],
							resources: { requests: { storage: '10Gi' } }
						}
					}
				]
			},
			status: { replicas: 3, readyReplicas: 3 }
		};
		const output = formatDescribe(sts);
		containsAll(output, 'Name:', 'db-sts', 'Replicas:', 'Service Name:', 'Volume Claim Templates:');
	});

	it('handles Job', () => {
		const job: any = {
			apiVersion: 'batch/v1',
			kind: 'Job',
			metadata: { name: 'batch-job', namespace: 'default' },
			spec: {
				backoffLimit: 4,
				completions: 1,
				parallelism: 1,
				template: {
					spec: { containers: [{ name: 'worker', image: 'busybox' }], restartPolicy: 'Never' }
				}
			},
			status: { succeeded: 1, completionTime: '2025-01-01T01:00:00Z' }
		};
		const output = formatDescribe(job);
		containsAll(output, 'Name:', 'batch-job', 'Backoff Limit:', 'Completions:');
	});
});
