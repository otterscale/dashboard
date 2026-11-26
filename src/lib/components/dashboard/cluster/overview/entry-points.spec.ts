import { describe, expect, it } from 'vitest';

import { buildEntryPoints, type EntryPointInputs } from './entry-points.svelte';

const MASTER = 'aiserver-nv-unknown-x8-229';
const owning = (namespace: string, name: string) => ({
	'gateway.envoyproxy.io/owning-gateway-name': name,
	'gateway.envoyproxy.io/owning-gateway-namespace': namespace
});
const lease = (name: string, holder: string) => ({
	metadata: { name, namespace: 'kube-system' },
	spec: { holderIdentity: holder }
});
const gateway = (namespace: string, name: string, address: string, programmed = 'True') => ({
	metadata: { namespace, name },
	status: {
		addresses: [{ value: address }],
		conditions: [{ type: 'Programmed', status: programmed }]
	}
});
const envoyService = (name: string, namespace: string, gatewayName = 'external') => ({
	metadata: { namespace: 'envoy-gateway-system', name, labels: owning(namespace, gatewayName) },
	spec: { externalTrafficPolicy: 'Local' }
});

// phison-hci on 2026-11-24, with the AI gateway: kserve/external's Envoy landed on the worker,
// so no master could announce 10.102.197.25 and it had no L2 announcement Lease.
const PHISON_HCI: EntryPointInputs = {
	info: { externalAddress: '10.102.197.23', inferenceURL: 'http://10.102.197.25' },
	leases: [
		lease('plndr-cp-lock', MASTER),
		lease('cilium-l2announce-envoy-gateway-system-envoy-gateway-system-external-00cc4fee', MASTER)
	],
	gateways: [
		gateway('gateway-system', 'external', '10.102.197.24'),
		gateway('kserve', 'external', '10.102.197.25'),
		gateway('kserve', 'kserve-ingress-gateway', '10.43.64.230')
	],
	services: [
		envoyService('envoy-gateway-system-external-00cc4fee', 'gateway-system'),
		envoyService('envoy-kserve-external-c2527dc1', 'kserve')
	],
	daemonsets: [{ metadata: { name: 'kube-vip' } }],
	nodeReady: () => true
};

const byId = (inputs: EntryPointInputs, id: string) =>
	buildEntryPoints(inputs).find((entry) => entry.id === id);

describe('buildEntryPoints', () => {
	it('reads phison-hci as it was', () => {
		expect(buildEntryPoints(PHISON_HCI)).toEqual([
			{ id: 'control-plane-vip', address: '10.102.197.23', activeOn: MASTER, state: 'active' },
			{
				id: 'hci-ingress',
				address: '10.102.197.24',
				activeOn: MASTER,
				gateway: 'gateway-system/external',
				state: 'active'
			},
			{
				id: 'inference-ingress',
				address: '10.102.197.25',
				activeOn: undefined,
				gateway: 'kserve/external',
				state: 'unannounced'
			}
		]);
	});

	it('uses the AI gateway, never the internal kserve-ingress-gateway', () => {
		const inputs = {
			...PHISON_HCI,
			gateways: [gateway('kserve', 'kserve-ingress-gateway', '10.102.197.25')]
		};
		expect(byId(inputs, 'inference-ingress')).toEqual({
			id: 'inference-ingress',
			address: '10.102.197.25',
			state: 'no-gateway'
		});
	});

	it('reports a published address no gateway serves', () => {
		const inputs = { ...PHISON_HCI, gateways: [gateway('gateway-system', 'external', '10.0.0.9')] };
		expect(byId(inputs, 'inference-ingress')).toEqual({
			id: 'inference-ingress',
			address: '10.102.197.25',
			state: 'no-gateway'
		});
	});

	it('reports a published address the AI gateway does not carry', () => {
		const inputs = {
			...PHISON_HCI,
			gateways: [
				gateway('gateway-system', 'external', '10.102.197.24'),
				gateway('kserve', 'external', '10.102.197.99')
			]
		};
		expect(byId(inputs, 'inference-ingress')).toEqual({
			id: 'inference-ingress',
			address: '10.102.197.25',
			gateway: 'kserve/external',
			state: 'no-gateway'
		});
	});

	it('reads the Lease whether Cilium joins namespace and Service with a dash or a dot', () => {
		const inputs = {
			...PHISON_HCI,
			leases: [
				lease('plndr-cp-lock', MASTER),
				lease('cilium-l2announce-envoy-gateway-system.envoy-kserve-external-c2527dc1', MASTER)
			]
		};
		expect(byId(inputs, 'inference-ingress')).toMatchObject({ activeOn: MASTER, state: 'active' });
	});

	it('reports a gateway that is not programmed as not ready', () => {
		const inputs = {
			...PHISON_HCI,
			gateways: [gateway('gateway-system', 'external', '10.102.197.24', 'False')]
		};
		expect(byId(inputs, 'hci-ingress')?.state).toBe('not-ready');
	});

	it('marks the holder unknown when its node is not Ready', () => {
		const inputs = { ...PHISON_HCI, nodeReady: () => false };
		expect(buildEntryPoints(inputs).map((e) => e.state)).toEqual([
			'unknown',
			'unknown',
			'unannounced'
		]);
	});

	it('does not judge announcement on clusters without L2 announcement leases', () => {
		const inputs = { ...PHISON_HCI, leases: [lease('plndr-cp-lock', MASTER)] };
		expect(byId(inputs, 'inference-ingress')?.state).toBe('active');
	});

	it('falls back to kube-vip for the VIP when otterscale-info is unreadable', () => {
		const inputs = {
			...PHISON_HCI,
			info: undefined,
			daemonsets: [
				{
					metadata: { name: 'kube-vip' },
					spec: {
						template: {
							spec: { containers: [{ env: [{ name: 'vip_address', value: '10.0.0.1' }] }] }
						}
					}
				}
			]
		};
		expect(byId(inputs, 'control-plane-vip')?.address).toBe('10.0.0.1');
		// No published address: the AI gateway's own address stands in.
		expect(byId(inputs, 'inference-ingress')?.address).toBe('10.102.197.25');
	});

	it('leaves out what the cluster does not have', () => {
		expect(
			buildEntryPoints({
				leases: [],
				gateways: [],
				services: [],
				daemonsets: [],
				nodeReady: () => true
			})
		).toEqual([]);
	});
});
