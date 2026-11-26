import { describe, expect, it } from 'vitest';

import {
	classifyWorkloadMembers,
	classifyWorkloads,
	type WorkspaceObjects
} from './workload-status';

const NOW = Date.parse('2026-11-26T12:00:00Z');

const objects: WorkspaceObjects = {
	models: [
		{ metadata: { name: 'qwen' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }
	],
	releases: [
		{
			metadata: { name: 'redis' },
			status: {
				conditions: [{ type: 'Ready', status: 'True' }],
				inventory: { entries: [{ id: 'ns_redis-master_apps_StatefulSet' }] }
			}
		}
	],
	deployments: [{ metadata: { name: 'api' }, spec: { replicas: 1 }, status: { readyReplicas: 1 } }],
	statefulSets: [
		{ metadata: { name: 'redis-master' }, spec: { replicas: 1 }, status: { readyReplicas: 1 } }
	],
	pods: [
		{
			metadata: {
				name: 'qwen-kserve-8c9dbb8cb-kpf2t',
				labels: {
					'app.kubernetes.io/part-of': 'llminferenceservice',
					'app.kubernetes.io/name': 'qwen',
					'pod-template-hash': '8c9dbb8cb'
				},
				ownerReferences: [{ kind: 'ReplicaSet', name: 'qwen-kserve-8c9dbb8cb' }]
			},
			status: { phase: 'Running' }
		},
		{
			metadata: {
				name: 'redis-master-0',
				ownerReferences: [{ kind: 'StatefulSet', name: 'redis-master' }]
			},
			status: { phase: 'Running' }
		},
		{
			metadata: {
				name: 'api-5d4f7c9b8-x2k4q',
				labels: { 'pod-template-hash': '5d4f7c9b8' },
				ownerReferences: [{ kind: 'ReplicaSet', name: 'api-5d4f7c9b8' }]
			},
			status: { phase: 'Running' }
		},
		{
			metadata: { name: 'download-z7dkc', ownerReferences: [{ kind: 'Job', name: 'download' }] },
			status: { phase: 'Succeeded' }
		}
	]
};

describe('classifyWorkloadMembers', () => {
	it('lists each workload with its pods and the workloads behind it', () => {
		expect(
			classifyWorkloadMembers(objects, NOW).map(({ kind, name, pods, owners }) => ({
				kind,
				name,
				pods,
				owners
			}))
		).toEqual([
			{
				kind: 'model',
				name: 'qwen',
				pods: ['qwen-kserve-8c9dbb8cb-kpf2t'],
				owners: ['deployments/qwen-kserve']
			},
			{
				kind: 'release',
				name: 'redis',
				pods: ['redis-master-0'],
				owners: ['statefulsets/redis-master']
			},
			{ kind: 'other', name: 'api', pods: ['api-5d4f7c9b8-x2k4q'], owners: ['deployments/api'] }
		]);
	});

	it('names the same workloads in the same states as classifyWorkloads', () => {
		const plain = classifyWorkloadMembers(objects, NOW).map((member) => {
			const { pods, owners, ...workload } = member;
			void [pods, owners];
			return workload;
		});
		expect(plain).toEqual(classifyWorkloads(objects, NOW));
	});
});
