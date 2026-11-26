// Pure calculations behind Storage Analytics: the pool, OSD and PVC lists the ranking and the
// detail read, their sort orders, threshold levels and the joins between PVCs and pools.
// No PromQL and no strings here; the cards format what these return.

import type { Sample } from '$lib/components/dashboard/kit/fetch';

import {
	type Filesystem,
	fullInDays,
	type Growth,
	growth,
	type Level,
	parseRedundancy,
	parseVolumeHandle,
	type Service,
	serviceOf
} from '../../overview/ceph';

export type Dim = 'pool' | 'osd' | 'pvc';
export const DIMS: Dim[] = ['pool', 'osd', 'pvc'];

/** Named query results, as `fetchInstant` returns them. */
export type Results<K extends string = string> = Record<K, Sample[]>;

const num = (samples: Sample[] | undefined, key: (l: Record<string, string>) => string) => {
	const map = new Map<string, number>();
	for (const s of samples ?? []) map.set(key(s.labels), s.value);
	return map;
};
const byPool = (samples: Sample[] | undefined) => num(samples, (l) => l.pool_id);
const byDaemon = (samples: Sample[] | undefined) => num(samples, (l) => l.ceph_daemon);
export const claimKey = (namespace: string, claim: string) => `${namespace}/${claim}`;
const byClaim = (samples: Sample[] | undefined) =>
	num(samples, (l) => claimKey(l.namespace, l.persistentvolumeclaim));

/** Full in past this many days for a pool is a warning (Overview's rule). */
export const POOL_FULL_IN_WARN_DAYS = 60;
/** Full in past this many days for a PVC is a warning: a PVC is resized, not a cluster. */
export const PVC_FULL_IN_WARN_DAYS = 30;
/** A PVC kubelet has not reported for this long is not mounted. */
export const NOT_MOUNTED_AFTER_SECONDS = 15 * 60;

export function filesystemsOf(samples: Sample[] | undefined): Filesystem[] {
	return (samples ?? []).map(({ labels: l }) => ({
		id: l.fs_id,
		name: l.name,
		dataPools: (l.data_pools ?? '').split(',').filter(Boolean),
		metadataPool: l.metadata_pool
	}));
}

// ─── Pools ───────────────────────────────────────────────────────────────────────────────────

export type PoolItem = {
	id: string;
	name: string;
	service: Service;
	copies?: number;
	copiesLabel?: string;
	type?: string;
	compression?: string;
	stored: number;
	storedRaw?: number;
	maxAvail: number;
	/** Ceph's %USED, 0–100. */
	usedPct: number;
	perDay?: number;
	growth?: Growth;
	fullIn?: number;
	pgs?: number;
};

/** Pools that will fill, soonest first; then the rest by stored, largest first (Overview's order). */
export function sortByFullIn<T extends { fullIn?: number }>(
	rows: T[],
	tieBreak: (a: T, b: T) => number
): T[] {
	return [...rows].sort((a, b) => {
		if (a.fullIn !== undefined && b.fullIn !== undefined) return a.fullIn - b.fullIn;
		if (a.fullIn !== undefined) return -1;
		if (b.fullIn !== undefined) return 1;
		return tieBreak(a, b);
	});
}

export function buildPools(r: Results): PoolItem[] {
	const filesystems = filesystemsOf(r.filesystems);
	const stored = byPool(r.stored);
	const storedRaw = byPool(r.storedRaw);
	const maxAvail = byPool(r.maxAvail);
	const used = byPool(r.percentUsed);
	const perDay = byPool(r.perDay);
	const pgs = byPool(r.pgs);
	const pools = (r.meta ?? []).map(({ labels: l }): PoolItem => {
		const redundancy = parseRedundancy(l.description);
		const avail = maxAvail.get(l.pool_id) ?? 0;
		const day = perDay.get(l.pool_id);
		return {
			id: l.pool_id,
			name: l.name,
			service: serviceOf({ id: l.pool_id, name: l.name, application: l.application }, filesystems),
			copies: redundancy?.copies,
			copiesLabel: redundancy?.label,
			type: l.type,
			compression: l.compression_mode,
			stored: stored.get(l.pool_id) ?? 0,
			storedRaw: storedRaw.get(l.pool_id),
			maxAvail: avail,
			usedPct: used.get(l.pool_id) ?? 0,
			perDay: day,
			growth: growth(day),
			fullIn: fullInDays(avail, day),
			pgs: pgs.get(l.pool_id)
		};
	});
	return sortByFullIn(pools, (a, b) => b.stored - a.stored);
}

/** The one device class every OSD shares, or undefined when they differ or none is known. */
export function soleDeviceClass(samples: Sample[] | undefined): string | undefined {
	const classes = (samples ?? []).map((s) => s.labels.device_class).filter(Boolean);
	return classes.length === 1 ? classes[0] : undefined;
}

// ─── OSDs ────────────────────────────────────────────────────────────────────────────────────

export type OsdItem = {
	id: string;
	host?: string;
	deviceClass?: string;
	store?: string;
	used?: number;
	total?: number;
	pct?: number;
	up?: boolean;
	in?: boolean;
	pgs?: number;
	readP95?: number;
	writeP95?: number;
	readOps?: number;
	writeOps?: number;
};

export type OsdCluster = {
	nearfull?: number;
	full?: number;
	readP95?: number;
	writeP95?: number;
	avgPgs?: number;
};

const first = (samples: Sample[] | undefined) => samples?.[0]?.value;

/** `osd.10` after `osd.9`. */
const osdNumber = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? Number.NaN);

export function buildOsds(r: Results): { osds: OsdItem[]; cluster: OsdCluster } {
	const used = byDaemon(r.used);
	const total = byDaemon(r.total);
	const up = byDaemon(r.up);
	const isIn = byDaemon(r.in);
	const pgs = byDaemon(r.pgs);
	const readP95 = byDaemon(r.readP95);
	const writeP95 = byDaemon(r.writeP95);
	const readOps = byDaemon(r.readOps);
	const writeOps = byDaemon(r.writeOps);
	const osds = (r.meta ?? []).map(({ labels: l }): OsdItem => {
		const id = l.ceph_daemon;
		const u = used.get(id);
		const t = total.get(id);
		return {
			id,
			host: l.hostname || undefined,
			deviceClass: l.device_class || undefined,
			store: l.objectstore || undefined,
			used: u,
			total: t,
			pct: u !== undefined && t ? (100 * u) / t : undefined,
			up: up.has(id) ? up.get(id) === 1 : undefined,
			in: isIn.has(id) ? isIn.get(id) === 1 : undefined,
			pgs: pgs.get(id),
			readP95: readP95.get(id),
			writeP95: writeP95.get(id),
			readOps: readOps.get(id),
			writeOps: writeOps.get(id)
		};
	});
	osds.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || osdNumber(a.id) - osdNumber(b.id));
	const withPgs = osds.filter((o) => o.pgs !== undefined);
	return {
		osds,
		cluster: {
			nearfull: first(r.nearfull),
			full: first(r.full),
			readP95: first(r.clusterReadP95),
			writeP95: first(r.clusterWriteP95),
			avgPgs: withPgs.length
				? withPgs.reduce((sum, o) => sum + (o.pgs ?? 0), 0) / withPgs.length
				: undefined
		}
	};
}

/**
 * An OSD's write p95 well above the cluster's: half as much again, and at least a millisecond more,
 * so a quiet cluster's noise is not a warning. With one OSD the two are the same and never warn.
 */
export function slowWrites(osd: number | undefined, cluster: number | undefined): boolean {
	if (osd === undefined || cluster === undefined) return false;
	return osd > cluster * 1.5 && osd - cluster >= 1;
}

/** PGs well above the average across OSDs: an uneven spread puts more data on this OSD. */
export function manyPgs(pgs: number | undefined, average: number | undefined): boolean {
	if (pgs === undefined || average === undefined || average <= 0) return false;
	return pgs > average * 1.1;
}

/** `/dev/nvme2n1` → the node_exporter model of that disk on that host, if known. */
export function diskModel(
	device: string | undefined,
	hostname: string | undefined,
	hosts: Sample[] | undefined,
	models: Sample[] | undefined
): string | undefined {
	if (!device || !hostname) return undefined;
	const name = device.replace(/^\/dev\//, '');
	const instances = new Set(
		(hosts ?? []).filter((s) => s.labels.nodename === hostname).map((s) => s.labels.instance)
	);
	return (models ?? []).find((s) => instances.has(s.labels.instance) && s.labels.device === name)
		?.labels.model;
}

// ─── PVCs ────────────────────────────────────────────────────────────────────────────────────

export type PvcItem = {
	key: string;
	name: string;
	namespace: string;
	storageClass: string;
	volume?: string;
	poolId?: string;
	poolName?: string;
	used?: number;
	capacity?: number;
	pct?: number;
	/** Reported by kubelet now; when false, the sizes are from `lastSeen` seconds ago. */
	live: boolean;
	lastSeenAgo?: number;
	perDay?: number;
	growth?: Growth;
	fullIn?: number;
	inodesUsed?: number;
	inodes?: number;
	accessModes: string[];
	created?: number;
	mountedBy: string[];
};

/** The pool that holds a Ceph CSI volume: RBD names the pool, CephFS the filesystem's data pool. */
export function poolOfVolume(
	driver: string,
	handle: string,
	filesystems: Filesystem[]
): string | undefined {
	const parsed = parseVolumeHandle(handle);
	if (!parsed) return undefined;
	if (/rbd\.csi\.ceph\.com$/.test(driver)) return String(parsed.location);
	if (/cephfs\.csi\.ceph\.com$/.test(driver)) {
		return filesystems.find((fs) => fs.id === String(parsed.location))?.dataPools[0];
	}
	return undefined;
}

export function buildPvcs(r: Results): PvcItem[] {
	const filesystems = filesystemsOf(r.filesystems);
	const poolNames = new Map((r.pools ?? []).map((s) => [s.labels.pool_id, s.labels.name]));
	const volumePool = new Map<string, string | undefined>();
	for (const { labels: l } of r.volumes ?? []) {
		volumePool.set(
			l.persistentvolume,
			poolOfVolume(l.csi_driver, l.csi_volume_handle, filesystems)
		);
	}
	const used = byClaim(r.used);
	const capacity = byClaim(r.capacity);
	const requested = byClaim(r.requested);
	const live = byClaim(r.live);
	const lastSeen = byClaim(r.lastSeen);
	const perDay = byClaim(r.perDay);
	const inodesUsed = byClaim(r.inodesUsed);
	const inodes = byClaim(r.inodes);
	const created = byClaim(r.created);
	const now = first(r.now) ?? Date.now() / 1000;
	const access = new Map<string, string[]>();
	for (const { labels: l } of r.access ?? []) {
		const key = claimKey(l.namespace, l.persistentvolumeclaim);
		access.set(key, [...(access.get(key) ?? []), l.access_mode].sort());
	}
	const mounts = new Map<string, string[]>();
	for (const { labels: l } of r.mounts ?? []) {
		const key = claimKey(l.namespace, l.persistentvolumeclaim);
		mounts.set(key, [...(mounts.get(key) ?? []), l.pod].sort());
	}
	const pvcs = (r.claims ?? []).map(({ labels: l }): PvcItem => {
		const key = claimKey(l.namespace, l.persistentvolumeclaim);
		const poolId = l.volumename ? volumePool.get(l.volumename) : undefined;
		const u = used.get(key);
		const c = capacity.get(key) ?? requested.get(key);
		const isLive = live.has(key);
		const seen = lastSeen.get(key);
		// An unmounted volume cannot grow, and the slope of its last mount says nothing about
		// what comes next, so only a reported one gets a growth and a Full in.
		const day = isLive ? perDay.get(key) : undefined;
		return {
			key,
			name: l.persistentvolumeclaim,
			namespace: l.namespace,
			storageClass: l.storageclass,
			volume: l.volumename || undefined,
			poolId,
			poolName: poolId ? poolNames.get(poolId) : undefined,
			used: u,
			capacity: c,
			pct: u !== undefined && c ? (100 * u) / c : undefined,
			live: isLive,
			lastSeenAgo: seen === undefined ? undefined : Math.max(0, now - seen),
			perDay: day,
			growth: growth(day),
			fullIn: u !== undefined && c !== undefined ? fullInDays(c - u, day) : undefined,
			inodesUsed: inodesUsed.get(key),
			inodes: inodes.get(key),
			accessModes: access.get(key) ?? [],
			created: created.get(key),
			mountedBy: mounts.get(key) ?? []
		};
	});
	// Those that fill first; then the fullest; then those kubelet never reported, by name.
	return sortByFullIn(pvcs, (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.key.localeCompare(b.key));
}

/** Whether a PVC's sizes are only from an earlier mount. */
export function notMounted(pvc: PvcItem): boolean {
	return !pvc.live && pvc.used !== undefined;
}

/** Files on the volume: CephFS reports no inodes (always 0), so only a real count is a number. */
export function filesOf(
	pvc: PvcItem
): { kind: 'count'; used: number; total?: number; pct?: number } | { kind: 'none' } {
	if (pvc.inodesUsed === undefined || !(pvc.inodesUsed > 0)) return { kind: 'none' };
	const total = pvc.inodes && pvc.inodes > 0 ? pvc.inodes : undefined;
	return {
		kind: 'count',
		used: pvc.inodesUsed,
		total,
		pct: total ? (100 * pvc.inodesUsed) / total : undefined
	};
}

// ─── Levels ──────────────────────────────────────────────────────────────────────────────────

/** A PVC's used share: warning from 80 %, critical from 90 %. */
export function pvcLevel(pct: number): Level {
	return pct >= 90 ? 'red' : pct >= 80 ? 'orange' : 'green';
}

/** Inodes run out like bytes do: the same 80 / 90 %. */
export const filesLevel = pvcLevel;
