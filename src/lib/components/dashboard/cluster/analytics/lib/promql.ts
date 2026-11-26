import {
	DCGM_GPU_MEMORY_TOTAL_BYTES,
	DCGM_GPU_MEMORY_USED_BYTES,
	escapePromqlStringLiteral,
	LIVE_PODS
} from '$lib/prometheus';

// PromQL for the Analytics tab. Builders only: no fetching, so tests can read the strings.

export const q = (value: string) => `"${escapePromqlStringLiteral(value)}"`;

/** cAdvisor series of real containers, never the pause sandbox. */
const REAL = 'container!="",container!="POD"';

export const CPU_USAGE = `irate(container_cpu_usage_seconds_total{${REAL}}[2m])`;
export const MEM_USAGE = `container_memory_working_set_bytes{${REAL}}`;

/**
 * HAMi names the workload in `namespace`/`pod` on clusters that scrape it with honorLabels, and in
 * `exported_namespace`/`exported_pod` on the rest. Copy the exported pair over when it is set, so
 * every query can read `namespace`/`pod` on either kind of cluster.
 */
export function hamiWorkload(metric: string): string {
	return (
		`label_replace(label_replace(${metric}, "namespace", "$1", "exported_namespace", "(.+)"),` +
		` "pod", "$1", "exported_pod", "(.+)")`
	);
}

/** Keep only series whose (rewritten) `namespace` is `namespace`; a selector can't follow label_replace. */
export function inNamespace(expr: string, namespace: string): string {
	return `(${expr}) and on (namespace) label_replace(vector(1), "namespace", ${q(namespace)}, "", "")`;
}

/** DCGM keys a node by `hostname`; the rest of the page uses `node`. */
export function dcgmByNode(expr: string): string {
	return `label_replace((${expr}), "node", "$1", "hostname", "(.*)")`;
}

/** DCGM keys a card by `UUID`, HAMi by `device_uuid`: same value, different label. */
export function dcgmByDevice(expr: string): string {
	return `label_replace((${expr}), "device_uuid", "$1", "UUID", "(.*)")`;
}

const alloc = (resource: 'cpu' | 'memory', node?: string) =>
	`sum by (node) (kube_node_status_allocatable{resource="${resource}"${node ? `,node=${q(node)}` : ''}})`;

const spec = (
	kind: 'requests' | 'limits',
	resource: 'cpu' | 'memory',
	by: string,
	extra = ''
): string =>
	`sum by (${by}) (kube_pod_container_resource_${kind}{resource="${resource}"${extra}} ${LIVE_PODS})`;

/** Container restarts over `range`, summed per node. */
export function restartsByNode(range: string): string {
	return (
		`sum by (node) (increase(kube_pod_container_status_restarts_total[${range}])` +
		` * on (namespace, pod) group_left (node) max by (namespace, pod, node) (kube_pod_info))`
	);
}

/** Node ranking: every number as a percentage of the node's allocatable, plus GPUs and restarts. */
export function nodeRankingQueries(restartRange = '1h'): Record<string, string> {
	const cpuAlloc = alloc('cpu');
	const memAlloc = alloc('memory');
	return {
		cpuUse: `100 * sum by (node) (${CPU_USAGE}) / ${cpuAlloc}`,
		cpuReq: `100 * ${spec('requests', 'cpu', 'node')} / ${cpuAlloc}`,
		cpuLim: `100 * ${spec('limits', 'cpu', 'node')} / ${cpuAlloc}`,
		memUse: `100 * sum by (node) (${MEM_USAGE}) / ${memAlloc}`,
		memReq: `100 * ${spec('requests', 'memory', 'node')} / ${memAlloc}`,
		memLim: `100 * ${spec('limits', 'memory', 'node')} / ${memAlloc}`,
		gpuUtil: `avg by (node) (${dcgmByNode('DCGM_FI_DEV_GPU_UTIL')})`,
		gpuAlloc:
			`100 * sum by (node) (hami_gpu_memory_allocated_bytes)` +
			` / sum by (node) (${dcgmByNode(DCGM_GPU_MEMORY_TOTAL_BYTES)})`,
		restarts: restartsByNode(restartRange)
	};
}

/** The same numbers averaged over a window ending at the query time. */
export function averaged(queries: Record<string, string>, range: string, step: number) {
	return Object.fromEntries(
		Object.entries(queries).map(([k, v]) => [
			k,
			k === 'restarts' ? v : `avg_over_time((${v})[${range}:${step}s])`
		])
	);
}

/** Things every node row needs besides its numbers: the node list, roles and GPU presence. */
export const NODE_FACTS = {
	nodes: 'max by (node) (kube_node_info)',
	roles: 'max by (node, role) (kube_node_role)',
	gpus: `count by (node) (${dcgmByNode('DCGM_FI_DEV_GPU_UTIL')})`
};

const nsHami = (metric: string) => hamiWorkload(metric);

/** Namespace ranking: cores and bytes, GPU utilisation and cards, restarts. */
export function namespaceRankingQueries(restartRange = '1h'): Record<string, string> {
	return {
		cpuUse: `sum by (namespace) (${CPU_USAGE})`,
		cpuReq: spec('requests', 'cpu', 'namespace'),
		cpuLim: spec('limits', 'cpu', 'namespace'),
		memUse: `sum by (namespace) (${MEM_USAGE})`,
		memReq: spec('requests', 'memory', 'namespace'),
		memLim: spec('limits', 'memory', 'namespace'),
		gpuUtil: `avg by (namespace) (${nsHami('hami_container_device_utilization_ratio')})`,
		gpus: `count by (namespace) (count by (namespace, device_uuid) (${nsHami('hami_vgpu_memory_allocated_bytes')}))`,
		restarts: `sum by (namespace) (increase(kube_pod_container_status_restarts_total[${restartRange}]))`
	};
}

export const NAMESPACE_FACTS = {
	namespaces: `max by (namespace) (kube_pod_info ${LIVE_PODS})`
};

/** One trend line per row for the ranking's History column. */
export function nodeTrendQuery(metric: 'cpu' | 'memory' | 'gpu' | 'restarts'): string {
	switch (metric) {
		case 'cpu':
			return `100 * sum by (node) (${CPU_USAGE}) / ${alloc('cpu')}`;
		case 'memory':
			return `100 * sum by (node) (${MEM_USAGE}) / ${alloc('memory')}`;
		case 'gpu':
			return `avg by (node) (${dcgmByNode('DCGM_FI_DEV_GPU_UTIL')})`;
		case 'restarts':
			return restartsByNode('5m');
	}
}

export function namespaceTrendQuery(metric: 'cpu' | 'memory' | 'gpu' | 'restarts'): string {
	switch (metric) {
		case 'cpu':
			return `sum by (namespace) (${CPU_USAGE})`;
		case 'memory':
			return `sum by (namespace) (${MEM_USAGE})`;
		case 'gpu':
			return `avg by (namespace) (${nsHami('hami_container_device_utilization_ratio')})`;
		case 'restarts':
			return `sum by (namespace) (increase(kube_pod_container_status_restarts_total[5m]))`;
	}
}

/** Node detail (Now): the five number cards. */
export function nodeKpiQueries(node: string, instance: string | undefined): Record<string, string> {
	const n = q(node);
	const fs: Record<string, string> = instance
		? {
				fsSize: `sum(node_filesystem_size_bytes{fstype!="rootfs",instance=${q(instance)},mountpoint="/"})`,
				fsAvail: `sum(node_filesystem_avail_bytes{fstype!="rootfs",instance=${q(instance)},mountpoint="/"})`
			}
		: {};
	return {
		cpuUsed: `sum(irate(container_cpu_usage_seconds_total{${REAL},node=${n}}[2m]))`,
		cpuAlloc: `sum(kube_node_status_allocatable{resource="cpu",node=${n}})`,
		memUsed: `sum(container_memory_working_set_bytes{${REAL},node=${n}})`,
		memAlloc: `sum(kube_node_status_allocatable{resource="memory",node=${n}})`,
		gpuCap: `sum(${DCGM_GPU_MEMORY_TOTAL_BYTES.replace(/DCGM_FI_DEV_FB_(\w+)/g, `DCGM_FI_DEV_FB_$1{hostname=${n}}`)})`,
		gpuCards: `count(DCGM_FI_DEV_GPU_UTIL{hostname=${n}})`,
		gpuModel: `count by (modelName) (DCGM_FI_DEV_GPU_UTIL{hostname=${n}})`,
		gpuAlloc: `sum(hami_gpu_memory_allocated_bytes{node=${n}})`,
		pods: `sum(kube_pod_status_phase{phase="Running"} * on (namespace, pod) group_left () kube_pod_info{node=${n}})`,
		podsAlloc: `sum(kube_node_status_allocatable{resource="pods",node=${n}})`,
		...fs
	};
}

/** Per card on one node: capacity, use and the model, keyed by `device_uuid`. */
export function nodeGpuQueries(node: string): Record<string, string> {
	const host = (expr: string) =>
		dcgmByDevice(expr.replace(/(DCGM_FI_DEV_\w+)/g, `$1{hostname=${q(node)}}`));
	return {
		gpuTotal: host(DCGM_GPU_MEMORY_TOTAL_BYTES),
		gpuUsed: host(DCGM_GPU_MEMORY_USED_BYTES),
		// Scheduler side, so it holds for a pod whose container is not reporting.
		gpuAlloc: `sum by (namespace, pod, device_uuid) (${hamiWorkload('hami_vgpu_memory_allocated_bytes')})`,
		// HAMi-core, from inside the container: present only while the container reports.
		gpuTracked: `sum by (namespace, pod, device_uuid) (${hamiWorkload('hami_vgpu_memory_used_bytes')})`
	};
}

/** Resource occupancy by pod: every live pod on the node with its CPU and memory. */
export function nodePodQueries(node: string): Record<string, string> {
	const n = q(node);
	const on = `,node=${n}`;
	return {
		pods: `max by (namespace, pod) (kube_pod_info{node=${n}} ${LIVE_PODS})`,
		cpuUse: `sum by (namespace, pod) (irate(container_cpu_usage_seconds_total{${REAL}${on}}[2m]))`,
		cpuReq: spec('requests', 'cpu', 'namespace, pod', on),
		cpuLim: spec('limits', 'cpu', 'namespace, pod', on),
		memUse: `sum by (namespace, pod) (container_memory_working_set_bytes{${REAL}${on}})`,
		memReq: spec('requests', 'memory', 'namespace, pod', on),
		memLim: spec('limits', 'memory', 'namespace, pod', on),
		cpuAlloc: `sum(kube_node_status_allocatable{resource="cpu",node=${n}})`,
		memAlloc: `sum(kube_node_status_allocatable{resource="memory",node=${n}})`,
		...nodeGpuQueries(node)
	};
}

/** Namespace detail (Now): pods, their placement and numbers, and the namespace's claims. */
export function namespaceNowQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	const sel = `,namespace=${ns}`;
	return {
		pods: `max by (namespace, pod, node) (kube_pod_info{namespace=${ns}} ${LIVE_PODS})`,
		running: `sum(kube_pod_status_phase{phase="Running",namespace=${ns}})`,
		restarts: `sum(increase(kube_pod_container_status_restarts_total{namespace=${ns}}[1h]))`,
		cpuUse: `sum by (namespace, pod) (irate(container_cpu_usage_seconds_total{${REAL}${sel}}[2m]))`,
		cpuReq: spec('requests', 'cpu', 'namespace, pod', sel),
		cpuLim: spec('limits', 'cpu', 'namespace, pod', sel),
		memUse: `sum by (namespace, pod) (container_memory_working_set_bytes{${REAL}${sel}})`,
		memReq: spec('requests', 'memory', 'namespace, pod', sel),
		memLim: spec('limits', 'memory', 'namespace, pod', sel),
		gpuCards: `count by (namespace, pod) (count by (namespace, pod, device_uuid) (${inNamespace(hamiWorkload('hami_vgpu_memory_allocated_bytes'), namespace)}))`,
		gpuUtil: `avg(${inNamespace(hamiWorkload('hami_container_device_utilization_ratio'), namespace)})`,
		pvcInfo: `max by (persistentvolumeclaim, storageclass) (kube_persistentvolumeclaim_info{namespace=${ns}})`,
		pvcRequest: `max by (persistentvolumeclaim) (kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace=${ns}})`,
		pvcUsed: `max by (persistentvolumeclaim) (kubelet_volume_stats_used_bytes{namespace=${ns}})`,
		pvcCapacity: `max by (persistentvolumeclaim) (kubelet_volume_stats_capacity_bytes{namespace=${ns}})`
	};
}

/** Network devices that carry the node's own traffic, not per-pod veths or overlay plumbing. */
export const NET_DEVICE =
	'device!~"lo|veth.*|cilium.*|lxc.*|flannel.*|cni.*|docker.*|tunl.*|vxlan.*"';
export const DISK_DEVICE =
	'device=~"(/dev/)?(mmcblk.p.+|nvme.+|rbd.+|sd.+|vd.+|xvd.+|dm-.+|dasd.+)"';

/** Node History: commitment, I/O and restarts as range queries. */
export function nodeHistoryQueries(
	node: string,
	instance: string | undefined
): Record<string, string> {
	const n = q(node);
	const cpuAlloc = `sum(kube_node_status_allocatable{resource="cpu",node=${n}})`;
	const memAlloc = `sum(kube_node_status_allocatable{resource="memory",node=${n}})`;
	const io: Record<string, string> = instance
		? {
				netRx: `sum(rate(node_network_receive_bytes_total{instance=${q(instance)},${NET_DEVICE}}[5m]))`,
				netTx: `sum(rate(node_network_transmit_bytes_total{instance=${q(instance)},${NET_DEVICE}}[5m]))`,
				diskRead: `sum(rate(node_disk_read_bytes_total{instance=${q(instance)},${DISK_DEVICE}}[5m]))`,
				diskWrite: `sum(rate(node_disk_written_bytes_total{instance=${q(instance)},${DISK_DEVICE}}[5m]))`
			}
		: {};
	return {
		cpuUse: `100 * sum(rate(container_cpu_usage_seconds_total{${REAL},node=${n}}[2m])) / ${cpuAlloc}`,
		cpuReq: `100 * sum(kube_pod_container_resource_requests{resource="cpu",node=${n}} ${LIVE_PODS}) / ${cpuAlloc}`,
		cpuLim: `100 * sum(kube_pod_container_resource_limits{resource="cpu",node=${n}} ${LIVE_PODS}) / ${cpuAlloc}`,
		memUse: `100 * sum(container_memory_working_set_bytes{${REAL},node=${n}}) / ${memAlloc}`,
		memReq: `100 * sum(kube_pod_container_resource_requests{resource="memory",node=${n}} ${LIVE_PODS}) / ${memAlloc}`,
		memLim: `100 * sum(kube_pod_container_resource_limits{resource="memory",node=${n}} ${LIVE_PODS}) / ${memAlloc}`,
		gpuUtil: `avg(DCGM_FI_DEV_GPU_UTIL{hostname=${n}})`,
		...io
	};
}

/** Node History: one row per card. */
export function nodeGpuHistoryQueries(node: string): Record<string, string> {
	const host = `hostname=${q(node)}`;
	return {
		util: `max by (UUID, device, modelName) (DCGM_FI_DEV_GPU_UTIL{${host}})`,
		used: `max by (UUID, device, modelName) (DCGM_FI_DEV_FB_USED{${host}}) * ${1024 * 1024}`
	};
}

/** Instant numbers over the whole window for the per-card rows. */
export function nodeGpuWindowQueries(node: string, range: string): Record<string, string> {
	const host = `hostname=${q(node)}`;
	return {
		total: `max by (UUID) (${DCGM_GPU_MEMORY_TOTAL_BYTES.replace(/DCGM_FI_DEV_FB_(\w+)/g, `DCGM_FI_DEV_FB_$1{${host}}`)})`,
		utilAvg: `max by (UUID) (avg_over_time(DCGM_FI_DEV_GPU_UTIL{${host}}[${range}]))`,
		tempPeak: `max by (UUID) (max_over_time(DCGM_FI_DEV_GPU_TEMP{${host}}[${range}]))`,
		powerAvg: `max by (UUID) (avg_over_time(DCGM_FI_DEV_POWER_USAGE{${host}}[${range}]))`
	};
}

/** Namespace History: commitment in cores and bytes, and GPU utilisation. */
export function namespaceHistoryQueries(namespace: string): Record<string, string> {
	const ns = q(namespace);
	return {
		cpuUse: `sum(rate(container_cpu_usage_seconds_total{${REAL},namespace=${ns}}[2m]))`,
		cpuReq: `sum(kube_pod_container_resource_requests{resource="cpu",namespace=${ns}} ${LIVE_PODS})`,
		cpuLim: `sum(kube_pod_container_resource_limits{resource="cpu",namespace=${ns}} ${LIVE_PODS})`,
		memUse: `sum(container_memory_working_set_bytes{${REAL},namespace=${ns}})`,
		memReq: `sum(kube_pod_container_resource_requests{resource="memory",namespace=${ns}} ${LIVE_PODS})`,
		memLim: `sum(kube_pod_container_resource_limits{resource="memory",namespace=${ns}} ${LIVE_PODS})`,
		gpuUtil: `avg(${inNamespace(hamiWorkload('hami_container_device_utilization_ratio'), namespace)})`
	};
}

/** Restarts per bucket of `stepSeconds` (5 minutes on a 1-hour window), for the History bars. */
export function restartBucketsQuery(
	scope: { node: string } | { namespace: string },
	stepSeconds = 300
): string {
	const w = `${stepSeconds}s`;
	if ('namespace' in scope) {
		return `sum(increase(kube_pod_container_status_restarts_total{namespace=${q(scope.namespace)}}[${w}]))`;
	}
	return (
		`sum(increase(kube_pod_container_status_restarts_total[${w}])` +
		` * on (namespace, pod) group_left () max by (namespace, pod) (kube_pod_info{node=${q(scope.node)}}))`
	);
}

/** The pods that restarted in the window, where they ran, and why the last one stopped. */
export function restartedPodQueries(
	scope: { node: string } | { namespace: string },
	range: string
): Record<string, string> {
	const where = 'namespace' in scope ? `{namespace=${q(scope.namespace)}}` : '';
	const onNode =
		'node' in scope
			? ` * on (namespace, pod) group_left () max by (namespace, pod) (kube_pod_info{node=${q(scope.node)}})`
			: '';
	return {
		restarts: `sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total${where}[${range}])${onNode}) > 0.5`,
		reason: `max by (namespace, pod, reason) (kube_pod_container_status_last_terminated_reason${where})`,
		placement: `max by (namespace, pod, node) (kube_pod_info${where})`
	};
}
