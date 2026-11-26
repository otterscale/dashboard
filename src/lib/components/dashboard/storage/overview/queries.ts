// PromQL for Storage Overview. Only the active mgr exports Ceph metrics, but a second scrape of
// it (or a failover mid-window) must not double a number, so every series is first reduced to
// one per daemon, pool or check with `max by`, then summed.

const perPool = (metric: string) => `max by (pool_id) (${metric})`;
const perDaemon = (metric: string) => `max by (ceph_daemon) (${metric})`;
const pgState = (state: string) => `sum(${perPool(`ceph_pg_${state}`)})`;

/** How far back a health check's start is looked for, and the sampling step of that look. */
export const CHECK_WINDOW = 7 * 86_400;
export const CHECK_STEP = 600;

export const HEADER_QUERIES = {
	version: 'count by (ceph_version) (ceph_mon_metadata)',
	hosts: 'count(count by (hostname) (ceph_osd_metadata))',
	osds: `count(${perDaemon('ceph_osd_metadata')})`,
	name: 'max by (cluster, namespace) (ceph_health_status)'
};

const detail = 'max by (name, severity) (ceph_health_detail)';
export const HEALTH_QUERIES = {
	status: 'max(ceph_health_status)',
	checks: `${detail} == 1`,
	cleared: `max by (name) (max_over_time((timestamp(${detail} == 0))[7d:10m]))`,
	firstActive: `min by (name) (min_over_time((timestamp(${detail} == 1))[7d:10m]))`,
	now: 'vector(time())',
	// Context for checks that name an OSD.
	osdUsed: perDaemon('ceph_osd_stat_bytes_used'),
	osdTotal: perDaemon('ceph_osd_stat_bytes'),
	fullRatio: 'max(ceph_osd_full_ratio)'
};

export const POOL_QUERIES = {
	meta: 'max by (pool_id, name, description, application) (ceph_pool_metadata)',
	stored: perPool('ceph_pool_stored'),
	maxAvail: perPool('ceph_pool_max_avail'),
	percentUsed: `100 * ${perPool('ceph_pool_percent_used')}`,
	// The 7-day average: net change over 7 days, divided by 7. A pool younger than that has no
	// sample a week back, so it falls back to the slope of what there is.
	perDay: `(${perPool('ceph_pool_stored')} - ${perPool('ceph_pool_stored offset 7d')}) / 7 or ${perPool('deriv(ceph_pool_stored[7d])')} * 86400`,
	filesystems: 'max by (fs_id, name, data_pools, metadata_pool) (ceph_fs_metadata)',
	volumes:
		'max by (persistentvolume, csi_driver, csi_volume_handle) (kube_persistentvolume_info{csi_driver=~".+\\\\.csi\\\\.ceph\\\\.com"})',
	rawTotal: 'max(ceph_cluster_total_bytes)',
	rawUsed: 'max(ceph_cluster_total_used_raw_bytes)',
	fullRatio: 'max(ceph_osd_full_ratio)'
};

// PVCs on a StorageClass served by Ceph CSI, matched on the provisioner rather than the class
// name. The request metric carries no storageclass label, so it is joined on the claim.
const CEPH_CLAIMS =
	'max by (namespace, persistentvolumeclaim, storageclass) (kube_persistentvolumeclaim_info)' +
	' * on (storageclass) group_left () max by (storageclass) (kube_storageclass_info{provisioner=~".+\\\\.csi\\\\.ceph\\\\.com"})';

export const CAPACITY_QUERIES = {
	rawTotal: 'max(ceph_cluster_total_bytes)',
	rawUsed: 'max(ceph_cluster_total_used_raw_bytes)',
	meta: POOL_QUERIES.meta,
	stored: POOL_QUERIES.stored,
	maxAvail: POOL_QUERIES.maxAvail,
	requested: `sum(max by (namespace, persistentvolumeclaim) (kube_persistentvolumeclaim_resource_requests_storage_bytes) * on (namespace, persistentvolumeclaim) group_left () (${CEPH_CLAIMS}))`,
	osdUsed: HEALTH_QUERIES.osdUsed,
	osdTotal: HEALTH_QUERIES.osdTotal,
	osdHost: 'max by (ceph_daemon, hostname) (ceph_osd_metadata)',
	nearfull: 'max(ceph_osd_nearfull_ratio)',
	full: 'max(ceph_osd_full_ratio)'
};

export const DAEMON_QUERIES = {
	monIn: `sum(${perDaemon('ceph_mon_quorum_status')})`,
	monTotal: `count(${perDaemon('ceph_mon_metadata')})`,
	mgrActive: `count(${perDaemon('ceph_mgr_status')} == 1)`,
	mgrTotal: `count(${perDaemon('ceph_mgr_metadata')})`,
	osdUp: `sum(${perDaemon('ceph_osd_up')})`,
	osdIn: `sum(${perDaemon('ceph_osd_in')})`,
	osdTotal: `count(${perDaemon('ceph_osd_metadata')})`,
	mds: `count(${perDaemon('ceph_mds_metadata')})`
};

export const PG_QUERIES = {
	total: pgState('total'),
	active: pgState('active'),
	clean: pgState('clean'),
	degraded: pgState('degraded'),
	undersized: pgState('undersized'),
	recovering: pgState('recovering'),
	backfilling: pgState('backfilling'),
	waiting: `${pgState('recovery_wait')} + ${pgState('backfill_wait')}`,
	recoveryBytes: `sum(${perPool('ceph_pool_recovering_bytes_per_sec')})`,
	recoveryObjects: `sum(${perPool('ceph_pool_recovering_objects_per_sec')})`,
	degradedObjects: 'max(ceph_num_objects_degraded)',
	misplacedObjects: 'max(ceph_num_objects_misplaced)',
	objects: perPool('ceph_pool_objects'),
	meta: POOL_QUERIES.meta,
	slowOps: 'max(ceph_healthcheck_slow_ops)'
};

/** Read and write series for the three charts. `window` is the rate window in seconds. */
export function performanceQueries(window: number): Record<string, string> {
	const rate = (metric: string) => `sum(${perDaemon(`rate(${metric}[${window}s])`)})`;
	const latency = (op: 'r' | 'w') =>
		`quantile(0.95, ${perDaemon(`rate(ceph_osd_op_${op}_latency_sum[${window}s])`)} / ${perDaemon(`rate(ceph_osd_op_${op}_latency_count[${window}s])`)}) * 1000`;
	return {
		readBytes: rate('ceph_osd_op_r_out_bytes'),
		writeBytes: rate('ceph_osd_op_w_in_bytes'),
		readOps: rate('ceph_osd_op_r'),
		writeOps: rate('ceph_osd_op_w'),
		readLatency: latency('r'),
		writeLatency: latency('w')
	};
}
