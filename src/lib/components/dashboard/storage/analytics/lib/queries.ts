// PromQL for Storage Analytics. As in Overview, only the active mgr exports Ceph metrics, but a
// second scrape (or a failover) must not double a number, so each series is first reduced to one
// per pool, daemon or claim with `max by`.

import { escapePromqlStringLiteral } from '$lib/prometheus';

import { POOL_QUERIES } from '../../overview/queries';

const perPool = (metric: string) => `max by (pool_id) (${metric})`;
const perDaemon = (metric: string) => `max by (ceph_daemon) (${metric})`;
const CLAIM = 'namespace, persistentvolumeclaim';
const perClaim = (metric: string) => `max by (${CLAIM}) (${metric})`;
const quote = (value: string) => `"${escapePromqlStringLiteral(value)}"`;

/** Rate window for a range query's step: never shorter than 5 min, so a sparse step misses nothing. */
export function rateWindow(stepSeconds: number): string {
	return `${Math.max(300, stepSeconds)}s`;
}

// ─── Pools ───────────────────────────────────────────────────────────────────────────────────

/** Every pool, for the ranking and the picked pool's numbers. Overview's queries, plus PGs. */
export const POOL_DATA = {
	meta: 'max by (pool_id, name, description, application, type, compression_mode) (ceph_pool_metadata)',
	stored: POOL_QUERIES.stored,
	storedRaw: perPool('ceph_pool_stored_raw'),
	maxAvail: POOL_QUERIES.maxAvail,
	percentUsed: POOL_QUERIES.percentUsed,
	perDay: POOL_QUERIES.perDay,
	filesystems: POOL_QUERIES.filesystems,
	pgs: perPool('ceph_pg_total'),
	// Ceph exports no pool's device class. When every OSD is of one class, so is every pool.
	osdClasses: 'count by (device_class) (max by (ceph_daemon, device_class) (ceph_osd_metadata))'
};

/** Read and write operations and bytes a second for one pool, over the last 5 minutes. */
export function poolRateQueries(poolId: string, window = '5m'): Record<string, string> {
	const rate = (metric: string) => perPool(`rate(${metric}{pool_id=${quote(poolId)}}[${window}])`);
	return {
		readOps: rate('ceph_pool_rd'),
		writeOps: rate('ceph_pool_wr'),
		readBytes: rate('ceph_pool_rd_bytes'),
		writeBytes: rate('ceph_pool_wr_bytes')
	};
}

export function poolHistoryQueries(poolId: string, stepSeconds: number): Record<string, string> {
	return {
		stored: perPool(`ceph_pool_stored{pool_id=${quote(poolId)}}`),
		...poolRateQueries(poolId, rateWindow(stepSeconds))
	};
}

// ─── OSDs ────────────────────────────────────────────────────────────────────────────────────

/** Mean latency of one operation type per OSD over `window`, in seconds. */
const meanLatency = (op: 'r' | 'w', window: string) =>
	`${perDaemon(`rate(ceph_osd_op_${op}_latency_sum[${window}])`)} / ${perDaemon(`rate(ceph_osd_op_${op}_latency_count[${window}])`)}`;

// Ceph exports latency only as a sum and a count, so an OSD's p95 is taken over time: the 95th
// percentile of its 5-minute mean across the last hour. The cluster's is the same over the
// 95th percentile across OSDs, the way Overview draws it.
const osdP95 = (op: 'r' | 'w') =>
	`quantile_over_time(0.95, (${meanLatency(op, '5m')})[1h:1m]) * 1000`;
const clusterP95 = (op: 'r' | 'w') =>
	`quantile_over_time(0.95, (quantile(0.95, ${meanLatency(op, '5m')}))[1h:1m]) * 1000`;

/** Every OSD, for the ranking and the picked OSD's numbers. */
export const OSD_DATA = {
	meta: 'max by (ceph_daemon, hostname, device_class, objectstore) (ceph_osd_metadata)',
	used: perDaemon('ceph_osd_stat_bytes_used'),
	total: perDaemon('ceph_osd_stat_bytes'),
	up: perDaemon('ceph_osd_up'),
	in: perDaemon('ceph_osd_in'),
	pgs: perDaemon('ceph_osd_numpg'),
	readP95: osdP95('r'),
	writeP95: osdP95('w'),
	clusterReadP95: clusterP95('r'),
	clusterWriteP95: clusterP95('w'),
	readOps: perDaemon('rate(ceph_osd_op_r[5m])'),
	writeOps: perDaemon('rate(ceph_osd_op_w[5m])'),
	nearfull: 'max(ceph_osd_nearfull_ratio)',
	full: 'max(ceph_osd_full_ratio)'
};

/** The picked OSD's disk, the disks' models, and its slow operations over a day. */
export function osdDeviceQueries(osd: string): Record<string, string> {
	return {
		disk: `max by (ceph_daemon, device, devices, instance) (ceph_disk_occupation{ceph_daemon=${quote(osd)}})`,
		// node_exporter keys a disk by its scrape address; node_uname_info maps that to the host.
		models: 'max by (instance, device, model) (node_disk_info)',
		hosts: 'max by (instance, nodename) (node_uname_info)',
		slowOps: `max(max_over_time(ceph_daemon_health_metrics{type="SLOW_OPS", ceph_daemon=${quote(osd)}}[24h]))`
	};
}

export function osdHistoryQueries(osd: string, stepSeconds: number): Record<string, string> {
	const window = rateWindow(stepSeconds);
	const one = `{ceph_daemon=${quote(osd)}}`;
	return {
		used: `100 * ${perDaemon(`ceph_osd_stat_bytes_used${one}`)} / ${perDaemon(`ceph_osd_stat_bytes${one}`)}`,
		read: `${perDaemon(`rate(ceph_osd_op_r_latency_sum${one}[${window}])`)} / ${perDaemon(`rate(ceph_osd_op_r_latency_count${one}[${window}])`)} * 1000`,
		write: `${perDaemon(`rate(ceph_osd_op_w_latency_sum${one}[${window}])`)} / ${perDaemon(`rate(ceph_osd_op_w_latency_count${one}[${window}])`)} * 1000`,
		clusterWrite: `quantile(0.95, ${meanLatency('w', window)}) * 1000`,
		ops: `${perDaemon(`rate(ceph_osd_op_r${one}[${window}])`)} + ${perDaemon(`rate(ceph_osd_op_w${one}[${window}])`)}`
	};
}

// ─── PVCs ────────────────────────────────────────────────────────────────────────────────────

const USED = 'kubelet_volume_stats_used_bytes';

/**
 * Every PVC on a Ceph CSI StorageClass, across all workspaces, with what places it in a pool.
 * kubelet reports a volume only while a Pod mounts it, so sizes are the last value of the past
 * 7 days and `live` says whether it is reported now.
 */
export const PVC_DATA = {
	claims:
		`max by (${CLAIM}, storageclass, volumename) (kube_persistentvolumeclaim_info)` +
		' * on (storageclass) group_left () max by (storageclass) (kube_storageclass_info{provisioner=~".+\\\\.csi\\\\.ceph\\\\.com"})',
	volumes: POOL_QUERIES.volumes,
	filesystems: POOL_QUERIES.filesystems,
	pools: 'max by (pool_id, name) (ceph_pool_metadata)',
	used: perClaim(`last_over_time(${USED}[7d])`),
	capacity: perClaim('last_over_time(kubelet_volume_stats_capacity_bytes[7d])'),
	requested: perClaim('kube_persistentvolumeclaim_resource_requests_storage_bytes'),
	live: perClaim(USED),
	lastSeen: perClaim(`max_over_time(timestamp(${USED})[7d:10m])`),
	// The 7-day average, as for pools: net change over 7 days ÷ 7; a claim not reported at both
	// ends falls back to the slope of what there is.
	perDay: `(${perClaim(USED)} - ${perClaim(`${USED} offset 7d`)}) / 7 or ${perClaim(`deriv(${USED}[7d])`)} * 86400`,
	inodesUsed: perClaim('last_over_time(kubelet_volume_stats_inodes_used[7d])'),
	inodes: perClaim('last_over_time(kubelet_volume_stats_inodes[7d])'),
	access: `max by (${CLAIM}, access_mode) (kube_persistentvolumeclaim_access_mode)`,
	created: perClaim('kube_persistentvolumeclaim_created'),
	mounts: `max by (${CLAIM}, pod) (kube_pod_spec_volumes_persistentvolumeclaims_info)`,
	now: 'vector(time())'
};

export function pvcHistoryQueries(namespace: string, claim: string): Record<string, string> {
	const one = `{namespace=${quote(namespace)}, persistentvolumeclaim=${quote(claim)}}`;
	return {
		used: perClaim(`${USED}${one}`),
		capacity: perClaim(`kubelet_volume_stats_capacity_bytes${one}`)
	};
}
