import { type Client } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

import { ReloadManager } from '$lib/components/custom/reloader';

import {
	field,
	type KubeObject,
	list,
	listObjects,
	type ListParams,
	readFailure,
	text
} from './kube';

// The cluster's fixed addresses and which master answers each, read from the Kubernetes API
// (SPEC 3.5). Shaped like the `entryPoints` of the backend summary SPEC 3.7 proposes, so the
// source can be swapped for that API without touching the card.
//
// Addresses start from kube-public/otterscale-info, which the otterscale-agent chart writes at
// install time and the model pages already quote ("Available at <inferenceURL>/..."). The
// Gateways are the AI gateway layout's: inference enters on kserve/external (the older
// kserve/kserve-ingress-gateway is internal there and is not an entry point).
//
//   control-plane VIP   address: `externalAddress` (else kube-vip's `vip_address`);
//                       holder: the `plndr-cp-lock` Lease
//   Inference ingress   address: host of `inferenceURL`; Gateway kserve/external
//   HCI ingress         gateway-system/external, which otterscale-info does not name yet
//   either ingress      Envoy Gateway creates a LoadBalancer Service per Gateway; Cilium's L2
//                       announcement Lease for that Service names the node answering ARP.
//                       With externalTrafficPolicy Local (Envoy's default), Cilium only lets
//                       nodes with a live local Envoy pod take that Lease (pkg/l2announcer; its
//                       docs still say the opposite), so an Envoy on no policy node means no Lease.
//
// The ConfigMap is readable by every user; the rest only by cluster admins. When nothing can be
// read the table is not drawn.

export type EntryPointId = 'control-plane-vip' | 'hci-ingress' | 'inference-ingress';

/**
 * `unannounced`: configured, but no node answers for the address.
 * `no-gateway`: otterscale-info publishes an address no Gateway serves.
 */
export type EntryPointState = 'active' | 'not-ready' | 'unannounced' | 'no-gateway' | 'unknown';

export type EntryPoint = {
	id: EntryPointId;
	address?: string;
	/** Node answering for the address. */
	activeOn?: string;
	/** `namespace/name` of the Gateway behind an ingress. */
	gateway?: string;
	state: EntryPointState;
};

const HCI_GATEWAY = 'gateway-system/external';
const INFERENCE_GATEWAY = 'kserve/external';
const KUBE_VIP_LEASE = 'plndr-cp-lock';
const L2_LEASE_PREFIX = 'cilium-l2announce-';
const OWNING_NAME = 'gateway.envoyproxy.io/owning-gateway-name';
const OWNING_NAMESPACE = 'gateway.envoyproxy.io/owning-gateway-namespace';

/** `http://10.0.0.5:8080/x` → `10.0.0.5`; a bare host passes through. */
function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url.includes('://') ? url : `http://${url}`).hostname || undefined;
	} catch {
		return undefined;
	}
}

export type EntryPointInputs = {
	/** `data` of kube-public/otterscale-info, or undefined when it could not be read. */
	info?: Record<string, string>;
	/** Leases in kube-system. */
	leases: KubeObject[];
	gateways: KubeObject[];
	/** Envoy's Services in envoy-gateway-system. */
	services: KubeObject[];
	/** DaemonSets in kube-system. */
	daemonsets: KubeObject[];
	/** Node name → Ready; undefined when not known. */
	nodeReady: (node: string) => boolean | undefined;
};

export function buildEntryPoints(inputs: EntryPointInputs): EntryPoint[] {
	const holders: Record<string, string> = {};
	for (const lease of inputs.leases) {
		const name = text(lease, 'metadata', 'name');
		const holder = text(lease, 'spec', 'holderIdentity');
		if (name && holder) holders[name] = holder;
	}
	// Without any L2 announcement Lease the addresses are announced some other way (BGP, an
	// external load balancer), so "no node answering" cannot be judged from here.
	const usesL2 = Object.keys(holders).some((name) => name.startsWith(L2_LEASE_PREFIX));
	const holderState = (holder: string | undefined): EntryPointState =>
		!holder ? 'unannounced' : inputs.nodeReady(holder) === false ? 'unknown' : 'active';

	const out: EntryPoint[] = [];

	// Control-plane VIP.
	const kubeVip = inputs.daemonsets.find((ds) =>
		(text(ds, 'metadata', 'name') ?? '').includes('kube-vip')
	);
	const vipFromDaemonSet = list(kubeVip, 'spec', 'template', 'spec', 'containers')
		.flatMap((c) => list(c, 'env'))
		.filter((e) => ['vip_address', 'address'].includes(text(e, 'name') ?? ''))
		.map((e) => text(e, 'value'))
		.find(Boolean);
	const vipAddress = inputs.info?.externalAddress || vipFromDaemonSet;
	if (vipAddress || KUBE_VIP_LEASE in holders) {
		const holder = holders[KUBE_VIP_LEASE];
		out.push({
			id: 'control-plane-vip',
			address: vipAddress,
			activeOn: holder,
			state: kubeVip || KUBE_VIP_LEASE in holders ? holderState(holder) : 'unknown'
		});
	}

	const gatewayKey = (g: unknown) =>
		`${text(g, 'metadata', 'namespace')}/${text(g, 'metadata', 'name')}`;
	// Cilium names the Lease after the Service. phison-hci (Cilium 1.20.4) joins namespace and name
	// with a dash; the upstream source builds `<namespace>.<name>`. Accept either.
	const serviceHolder = (service: unknown): string | undefined => {
		const namespace = text(service, 'metadata', 'namespace');
		const name = text(service, 'metadata', 'name');
		return (
			holders[`${L2_LEASE_PREFIX}${namespace}-${name}`] ??
			holders[`${L2_LEASE_PREFIX}${namespace}.${name}`]
		);
	};

	const ingress = (id: EntryPointId, gateway: unknown, address: string | undefined): EntryPoint => {
		if (!gateway) return { id, address, state: 'no-gateway' };
		const addresses = list(gateway, 'status', 'addresses')
			.map((a) => text(a, 'value'))
			.filter((a): a is string => !!a);
		// The published address must be the Gateway's, or the row would show one IP and judge another.
		if (address && addresses.length > 0 && !addresses.includes(address)) {
			return { id, address, gateway: gatewayKey(gateway), state: 'no-gateway' };
		}
		const namespace = text(gateway, 'metadata', 'namespace');
		const name = text(gateway, 'metadata', 'name');
		const programmed = list(gateway, 'status', 'conditions').some(
			(c) => text(c, 'type') === 'Programmed' && text(c, 'status') === 'True'
		);
		const owned = (o: unknown) =>
			text(o, 'metadata', 'labels', OWNING_NAME) === name &&
			text(o, 'metadata', 'labels', OWNING_NAMESPACE) === namespace;
		const service = inputs.services.find(owned);
		const holder = service ? serviceHolder(service) : undefined;
		return {
			id,
			address: address ?? addresses[0],
			activeOn: holder,
			gateway: gatewayKey(gateway),
			state: !programmed ? 'not-ready' : usesL2 ? holderState(holder) : 'active'
		};
	};

	const hci = inputs.gateways.find((g) => gatewayKey(g) === HCI_GATEWAY);
	if (hci) out.push(ingress('hci-ingress', hci, undefined));

	// A published inference address with no AI gateway behind it is a broken install, not an
	// absent feature, so it gets a row.
	const inference = inputs.gateways.find((g) => gatewayKey(g) === INFERENCE_GATEWAY);
	const inferenceAddress = hostOf(inputs.info?.inferenceURL);
	if (inference || inferenceAddress) {
		out.push(ingress('inference-ingress', inference, inferenceAddress));
	}
	return out;
}

/** Reads the objects every 60 s; `entryPoints` is null until something could be read. */
export class EntryPointsSource {
	entryPoints = $state.raw<EntryPoint[] | null>(null);

	#client: Client<typeof ResourceService>;
	#cluster: string;
	#nodeReady: EntryPointInputs['nodeReady'];
	#reload: ReloadManager;

	constructor(
		client: Client<typeof ResourceService>,
		cluster: string,
		nodeReady: EntryPointInputs['nodeReady']
	) {
		this.#client = client;
		this.#cluster = cluster;
		this.#nodeReady = nodeReady;
		this.#reload = new ReloadManager(() => void this.refresh());
		this.#reload.interval = 60;
	}

	/** Read now, then every interval. */
	start() {
		this.#reload.restart();
	}

	stop() {
		this.#reload.stop();
	}

	#list(params: ListParams) {
		return listObjects(this.#client, this.#cluster, params);
	}

	/** `data` of otterscale-info; undefined when there is none to read, `failed` when the read broke. */
	async #info(): Promise<Record<string, string> | undefined | 'failed'> {
		try {
			const response = await this.#client.get({
				cluster: this.#cluster,
				namespace: 'kube-public',
				name: 'otterscale-info',
				group: '',
				version: 'v1',
				resource: 'configmaps'
			});
			const data = field(response.object, 'data');
			return typeof data === 'object' && data ? (data as Record<string, string>) : undefined;
		} catch (error) {
			return readFailure(error) === 'failed' ? 'failed' : undefined;
		}
	}

	async refresh() {
		const envoy = { namespace: 'envoy-gateway-system', labelSelector: OWNING_NAME };
		const [info, leases, gateways, services, daemonsets] = await Promise.all([
			this.#info(),
			this.#list({
				group: 'coordination.k8s.io',
				version: 'v1',
				resource: 'leases',
				namespace: 'kube-system'
			}),
			this.#list({
				group: 'gateway.networking.k8s.io',
				version: 'v1',
				resource: 'gateways',
				namespace: ''
			}),
			this.#list({ group: '', version: 'v1', resource: 'services', ...envoy }),
			this.#list({ group: 'apps', version: 'v1', resource: 'daemonsets', namespace: 'kube-system' })
		]);
		// A read that broke (network, timeout) says nothing about the cluster: keep what the last
		// read showed, or the table would vanish and come back with the next poll.
		if ([info, leases, gateways, services, daemonsets].includes('failed')) return;
		// Refused (anyone but a cluster admin) or not installed reads as nothing there.
		const read = (listed: KubeObject[] | string) => (Array.isArray(listed) ? listed : undefined);
		// Without the Kubernetes objects there is no status to show, only addresses, and those
		// belong in connection info rather than a health table.
		if (!read(leases) && !read(gateways)) {
			this.entryPoints = null;
			return;
		}
		const built = buildEntryPoints({
			info: typeof info === 'object' ? info : undefined,
			leases: read(leases) ?? [],
			gateways: read(gateways) ?? [],
			services: read(services) ?? [],
			daemonsets: read(daemonsets) ?? [],
			nodeReady: this.#nodeReady
		});
		this.entryPoints = built.length > 0 ? built : null;
	}
}
