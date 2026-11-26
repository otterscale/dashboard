// Pure calculations behind Storage Overview: capacity, pool growth and Full in, placement-group
// groups, pool services and the Object fold, PVCs per pool, and how long a health check has run.
// No PromQL and no strings here; the cards format what these return.

export const DAY = 86_400;
export const KIB = 1024;
export const MIB = 1024 ** 2;
export const GIB = 1024 ** 3;
export const TIB = 1024 ** 4;

/** Growth under this many bytes a day reads as Flat: no Full in, no number. */
export const FLAT_BYTES_PER_DAY = MIB;
/** Past this, Full in reads "more than 5 years" rather than a count no one can plan with. */
export const FULL_IN_CAP_DAYS = 5 * 365;
/** Full in under this many days is a warning. */
export const FULL_IN_WARN_DAYS = 60;

export type Level = 'green' | 'orange' | 'red';

// ─── Capacity ────────────────────────────────────────────────────────────────────────────────

export type PoolCapacity = { stored: number; maxAvail: number; copies?: number };
export type OsdUsage = { id: string; host?: string; used: number; total: number };

export type CapacityInput = {
	rawTotal: number;
	rawUsed: number;
	pools: PoolCapacity[];
	/** Bytes requested by PVCs on a Ceph StorageClass. */
	requested?: number;
	osds: OsdUsage[];
};

export type Capacity = {
	raw: { used: number; total: number; pct: number; osds: number };
	/** Data before replication, summed over pools. */
	stored: number;
	/** What could still be written, after copies: the largest pool's MAX AVAIL. */
	writable: number;
	/** The copies behind `writable`, for "after N copies". */
	writableCopies?: number;
	/** Stored plus writable: what the pools could hold in all. */
	usable: number;
	storedPct: number;
	promised?: { requested: number; pct: number };
	fullest?: OsdUsage & { pct: number };
};

/**
 * Usable space follows Ceph's own MAX AVAIL, which already stops at the full ratio and divides by
 * the pool's copies. Pools on the same OSDs share one MAX AVAIL, so it is taken once (the
 * largest), never summed.
 */
export function capacity(input: CapacityInput): Capacity {
	let stored = 0;
	let writable = 0;
	let writableCopies: number | undefined;
	for (const pool of input.pools) {
		if (Number.isFinite(pool.stored)) stored += pool.stored;
		if (Number.isFinite(pool.maxAvail) && pool.maxAvail > writable) {
			writable = pool.maxAvail;
			writableCopies = pool.copies;
		}
	}
	const usable = stored + writable;
	let fullest: Capacity['fullest'];
	for (const osd of input.osds) {
		if (!(osd.total > 0)) continue;
		const pct = (100 * osd.used) / osd.total;
		if (!fullest || pct > fullest.pct) fullest = { ...osd, pct };
	}
	return {
		raw: {
			used: input.rawUsed,
			total: input.rawTotal,
			pct: input.rawTotal > 0 ? (100 * input.rawUsed) / input.rawTotal : 0,
			osds: input.osds.length
		},
		stored,
		writable,
		writableCopies,
		usable,
		storedPct: usable > 0 ? (100 * stored) / usable : 0,
		promised:
			input.requested === undefined
				? undefined
				: {
						requested: input.requested,
						pct: usable > 0 ? (100 * input.requested) / usable : 0
					},
		fullest
	};
}

/** Raw capacity: warning from 75 %, critical from 85 %. */
export function rawLevel(pct: number): Level {
	return pct >= 85 ? 'red' : pct >= 75 ? 'orange' : 'green';
}

/** Promised to PVCs: warning from 80 %, critical from 100 % of usable space. */
export function promisedLevel(pct: number): Level {
	return pct >= 100 ? 'red' : pct >= 80 ? 'orange' : 'green';
}

/** The fullest OSD against the cluster's own ratios (0–1), not fixed numbers. */
export function osdLevel(pct: number, nearfull: number, full: number): Level {
	const ratio = pct / 100;
	return ratio >= full ? 'red' : ratio >= nearfull ? 'orange' : 'green';
}

// ─── Growth and Full in ──────────────────────────────────────────────────────────────────────

export type Growth = { kind: 'growing' | 'flat' | 'shrinking'; perDay: number };

export function growth(perDay: number | undefined): Growth | undefined {
	if (perDay === undefined || !Number.isFinite(perDay)) return undefined;
	if (perDay >= FLAT_BYTES_PER_DAY) return { kind: 'growing', perDay };
	if (perDay <= -FLAT_BYTES_PER_DAY) return { kind: 'shrinking', perDay };
	return { kind: 'flat', perDay: 0 };
}

/** Days until `available` is used up at `perDay`; undefined when it is not growing. */
export function fullInDays(available: number, perDay: number | undefined): number | undefined {
	if (perDay === undefined || !(perDay >= FLAT_BYTES_PER_DAY)) return undefined;
	if (!(available > 0)) return 0;
	return available / perDay;
}

/**
 * When the space every pool shares runs out: raw room left below the full ratio, over the raw
 * bytes written a day (each pool's growth times its copies). Pools on the same OSDs fill
 * together, so this comes before any single pool's own estimate.
 */
export function sharedFullInDays(
	rawTotal: number,
	rawUsed: number,
	fullRatio: number,
	pools: { perDay?: number; copies?: number }[]
): number | undefined {
	let rawPerDay = 0;
	for (const pool of pools) {
		if (pool.perDay === undefined || !(pool.perDay >= FLAT_BYTES_PER_DAY)) continue;
		rawPerDay += pool.perDay * (pool.copies ?? 1);
	}
	if (rawPerDay <= 0) return undefined;
	return Math.max(0, rawTotal * fullRatio - rawUsed) / rawPerDay;
}

// ─── Pools ───────────────────────────────────────────────────────────────────────────────────

export type Service = 'rbd' | 'cephfs-data' | 'cephfs-metadata' | 'object' | 'system' | 'other';

export type Filesystem = { id: string; name: string; dataPools: string[]; metadataPool: string };

/** `replica:3` → 3 copies; `ec:4+2` → 1.5 raw bytes per byte. */
export function parseRedundancy(
	description: string | undefined
): { copies: number; label: string } | undefined {
	if (!description) return undefined;
	const replica = /^replica:(\d+)$/.exec(description.trim());
	if (replica) {
		const copies = Number(replica[1]);
		return { copies, label: `${copies}×` };
	}
	const ec = /^ec:(\d+)\+(\d+)$/.exec(description.trim());
	if (ec) {
		const k = Number(ec[1]);
		const m = Number(ec[2]);
		return { copies: (k + m) / k, label: `EC ${k}+${m}` };
	}
	return undefined;
}

/** CephFS pools by the filesystem map, then Ceph's application tag. */
export function serviceOf(
	pool: { id: string; name: string; application?: string },
	filesystems: Filesystem[]
): Service {
	for (const fs of filesystems) {
		if (fs.metadataPool === pool.id) return 'cephfs-metadata';
		if (fs.dataPools.includes(pool.id)) return 'cephfs-data';
	}
	const app = (pool.application ?? '').toLowerCase();
	if (app === 'block' || app === 'rbd') return 'rbd';
	if (app === 'object' || app === 'rgw') return 'object';
	if (app === 'filesystem' || app === 'cephfs') {
		return /metadata/i.test(pool.name) ? 'cephfs-metadata' : 'cephfs-data';
	}
	if (pool.name === '.mgr' || pool.name === '.nfs' || app === 'mgr' || app === 'mgr_devicehealth') {
		return 'system';
	}
	return 'other';
}

export type Pool = {
	id: string;
	name: string;
	service: Service;
	copies?: number;
	copiesLabel?: string;
	stored: number;
	maxAvail: number;
	/** Ceph's %USED, 0–100. */
	usedPct: number;
	/** Bytes a day; undefined when the pool has no history yet. */
	perDay?: number;
	pvcs: number;
};

export type PoolRow = Pool & {
	growth?: Growth;
	fullIn?: number;
	/** Set on the folded Object row: the pools inside it. */
	members?: PoolRow[];
};

function withEstimate(pool: Pool): PoolRow {
	return { ...pool, growth: growth(pool.perDay), fullIn: fullInDays(pool.maxAvail, pool.perDay) };
}

/**
 * The Object service's pools (RGW keeps half a dozen small ones) as one row: their sums, the
 * shared MAX AVAIL, and the soonest Full in among them or their combined growth.
 */
export function foldObjectPools(rows: PoolRow[]): PoolRow[] {
	const objects = rows.filter((row) => row.service === 'object');
	if (objects.length < 2) return rows;
	let stored = 0;
	let usedPct = 0;
	let perDay: number | undefined;
	let pvcs = 0;
	let maxAvail = 0;
	for (const row of objects) {
		stored += row.stored;
		usedPct += row.usedPct;
		pvcs += row.pvcs;
		maxAvail = Math.max(maxAvail, row.maxAvail);
		if (row.perDay !== undefined) perDay = (perDay ?? 0) + row.perDay;
	}
	const copies = new Set(objects.map((row) => row.copiesLabel));
	const combined = fullInDays(maxAvail, perDay);
	const soonest = Math.min(...objects.map((row) => row.fullIn ?? Infinity), combined ?? Infinity);
	const group: PoolRow = {
		id: objects.map((row) => row.id).join(','),
		name: '',
		service: 'object',
		copies: copies.size === 1 ? objects[0].copies : undefined,
		copiesLabel: copies.size === 1 ? objects[0].copiesLabel : undefined,
		stored,
		maxAvail,
		usedPct,
		perDay,
		pvcs,
		growth: growth(perDay),
		fullIn: Number.isFinite(soonest) ? soonest : undefined,
		members: sortPools(objects)
	};
	return sortPools([...rows.filter((row) => row.service !== 'object'), group]);
}

/** Pools that will fill, soonest first; then the rest by stored, largest first. */
export function sortPools(rows: PoolRow[]): PoolRow[] {
	return [...rows].sort((a, b) => {
		if (a.fullIn !== undefined && b.fullIn !== undefined) return a.fullIn - b.fullIn;
		if (a.fullIn !== undefined) return -1;
		if (b.fullIn !== undefined) return 1;
		return b.stored - a.stored;
	});
}

export function poolRows(pools: Pool[]): PoolRow[] {
	return foldObjectPools(sortPools(pools.map(withEstimate)));
}

/** The pool adding the most bytes a day, if any is growing. */
export function fastestGrowing(pools: Pool[]): Pool | undefined {
	let best: Pool | undefined;
	for (const pool of pools) {
		if (pool.perDay === undefined || !(pool.perDay >= FLAT_BYTES_PER_DAY)) continue;
		if (!best || pool.perDay > (best.perDay ?? 0)) best = pool;
	}
	return best;
}

// ─── PVCs per pool ───────────────────────────────────────────────────────────────────────────

/**
 * Ceph CSI volume handle: `<version>-<cluster id length, hex>-<cluster id>-<location, 16 hex>-<uuid>`.
 * The location is the pool ID for RBD and the filesystem ID for CephFS, in hex.
 */
export function parseVolumeHandle(handle: string): { location: number } | undefined {
	const head = /^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(handle);
	if (!head) return undefined;
	const length = parseInt(head[2], 16);
	const rest = handle.slice(head[0].length + length);
	const tail = /^-([0-9a-f]{16})-[0-9a-f-]{36}$/i.exec(rest);
	if (!tail) return undefined;
	return { location: parseInt(tail[1], 16) };
}

/** PersistentVolumes counted against the pool that holds their data. */
export function pvcsPerPool(
	volumes: { driver: string; handle: string }[],
	filesystems: Filesystem[]
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const volume of volumes) {
		const parsed = parseVolumeHandle(volume.handle);
		if (!parsed) continue;
		let pool: string | undefined;
		if (/rbd\.csi\.ceph\.com$/.test(volume.driver)) {
			pool = String(parsed.location);
		} else if (/cephfs\.csi\.ceph\.com$/.test(volume.driver)) {
			pool = filesystems.find((fs) => fs.id === String(parsed.location))?.dataPools[0];
		}
		if (pool !== undefined) counts.set(pool, (counts.get(pool) ?? 0) + 1);
	}
	return counts;
}

// ─── Placement groups ────────────────────────────────────────────────────────────────────────

export type PgCounts = {
	total: number;
	active: number;
	clean: number;
	degraded: number;
	undersized: number;
	recovering: number;
	backfilling: number;
	/** Queued to recover or backfill: `recovery_wait` and `backfill_wait`. */
	waiting?: number;
};

export type PgGroups = {
	total: number;
	/** active+clean. */
	clean: number;
	/** Being repaired or queued for it. */
	moving: number;
	/** Inactive, or degraded or undersized with no repair under way. */
	bad: number;
	inactive: number;
};

/**
 * One group per PG. Ceph reports each state as its own count and a PG is often in several at once
 * (`active+recovering+degraded`), so the counts are never added up. A PG that is not serving
 * reads is bad; one being repaired or queued for repair is moving, even while it is degraded;
 * whatever else is not clean is bad.
 */
export function groupPgs(counts: PgCounts): PgGroups {
	const total = Math.max(0, counts.total);
	const clean = Math.min(total, counts.clean, counts.active);
	const inactive = Math.min(total - clean, Math.max(0, total - counts.active));
	const repairing = counts.recovering + counts.backfilling + (counts.waiting ?? 0);
	const moving = Math.max(0, Math.min(total - clean - inactive, repairing));
	return { total, clean, moving, bad: total - clean - moving, inactive };
}

// ─── Health checks ───────────────────────────────────────────────────────────────────────────

/**
 * How long an active check has run, from the last sample where it read 0 (cleared) or, failing
 * that, the first sample where it read 1. A check active for the whole window is `atLeast`.
 * Times are in seconds.
 */
export function checkAge(
	now: number,
	window: number,
	step: number,
	lastCleared: number | undefined,
	firstActive: number | undefined
): { seconds: number; atLeast: boolean } {
	if (lastCleared !== undefined) return { seconds: Math.max(0, now - lastCleared), atLeast: false };
	if (firstActive !== undefined && firstActive > now - window + step) {
		return { seconds: Math.max(0, now - firstActive), atLeast: false };
	}
	return { seconds: window, atLeast: true };
}

/** `ceph version 20.2.4 (…) tentacle (stable …)` → `{ release: 'Tentacle', version: '20.2.4' }`. */
export function parseCephVersion(
	text: string | undefined
): { release?: string; version: string } | undefined {
	if (!text) return undefined;
	const match = /ceph version (\S+)(?: \([0-9a-f]+\))?(?: (\w+))?/i.exec(text);
	if (!match) return undefined;
	const release = match[2] ? match[2][0].toUpperCase() + match[2].slice(1) : undefined;
	return { release, version: match[1] };
}

/**
 * A pool name split for a middle ellipsis: the last `.` segment (or `-` segment, for a name with
 * no dot) stays whole, since pools of one service differ at the end.
 * `ceph-objectstore.rgw.buckets.non-ec` → [`ceph-objectstore.rgw.buckets`, `.non-ec`].
 */
export function splitPoolName(name: string): [string, string] {
	const dot = name.lastIndexOf('.');
	const cut = dot > 0 ? dot : name.lastIndexOf('-');
	if (cut <= 0) return ['', name];
	return [name.slice(0, cut), name.slice(cut)];
}

/**
 * Checks about configuration or hygiene rather than data or service: weak key types, pools kept
 * with fewer copies than recommended, placement-group counts, a missing standby. Expected on a
 * small or test cluster, so they are counted but not listed, and do not colour the state.
 */
export const REMINDER_CHECKS = new Set([
	'AUTH_INSECURE_KEYS_ALLOWED',
	'AUTH_INSECURE_CLIENT_KEY_TYPE',
	'AUTH_INSECURE_KEYS_CREATABLE',
	'POOL_NO_REDUNDANCY',
	'TOO_FEW_OSDS',
	'POOL_APP_NOT_ENABLED',
	'TOO_MANY_PGS',
	'POOL_TOO_FEW_PGS',
	'POOL_TOO_MANY_PGS',
	'MDS_INSUFFICIENT_STANDBY',
	'RECENT_CRASH'
]);

export type HealthLevel = 'ok' | 'warn' | 'err';

/** A HEALTH_ERR check, or one not known to be a reminder, is one to act on. */
export function isReminder(check: { code: string; error: boolean }): boolean {
	return !check.error && REMINDER_CHECKS.has(check.code);
}

/**
 * The state the card shows: from the checks that need action, not Ceph's own status, so a
 * cluster whose only checks are reminders reads Healthy. With no checks to go by (none reported,
 * though Ceph is not OK), Ceph's status stands.
 */
export function shownLevel(
	status: number | undefined,
	checks: { code: string; error: boolean }[]
): HealthLevel {
	if (checks.length === 0) return status === 2 ? 'err' : status === 1 ? 'warn' : 'ok';
	const important = checks.filter((check) => !isReminder(check));
	if (important.some((check) => check.error)) return 'err';
	return important.length > 0 ? 'warn' : 'ok';
}
