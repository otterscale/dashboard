import { describe, expect, it } from 'vitest';

import {
	capacity,
	checkAge,
	DAY,
	fastestGrowing,
	foldObjectPools,
	fullInDays,
	GIB,
	groupPgs,
	growth,
	isReminder,
	MIB,
	osdLevel,
	parseCephVersion,
	parseRedundancy,
	parseVolumeHandle,
	type Pool,
	poolRows,
	promisedLevel,
	pvcsPerPool,
	rawLevel,
	serviceOf,
	sharedFullInDays,
	shownLevel,
	splitPoolName
} from './ceph';

// phison-hci on 2026-11-25: one NVMe OSD, every pool one copy.
const RAW_TOTAL = 7_681_501_126_656;
const RAW_USED = 304_213_708_800;
const MAX_AVAIL = 6_993_212_342_272;
const FS = [{ id: '1', name: 'ceph-filesystem', dataPools: ['6'], metadataPool: '5' }];

const pool = (over: Partial<Pool> & { id: string }): Pool => ({
	name: `pool-${over.id}`,
	service: 'rbd',
	copies: 1,
	copiesLabel: '1×',
	stored: 0,
	maxAvail: MAX_AVAIL,
	usedPct: 0,
	pvcs: 0,
	...over
});

describe('capacity', () => {
	it('reads the real single-OSD cluster', () => {
		const c = capacity({
			rawTotal: RAW_TOTAL,
			rawUsed: RAW_USED,
			pools: [
				{ stored: 202_710_313_590, maxAvail: MAX_AVAIL, copies: 1 },
				{ stored: 100_085_299_444, maxAvail: MAX_AVAIL, copies: 1 },
				{ stored: 12_633_829, maxAvail: MAX_AVAIL, copies: 1 }
			],
			requested: 1_066_225_631_232,
			osds: [{ id: 'osd.0', host: 'aiserver', used: RAW_USED, total: RAW_TOTAL }]
		});
		expect(c.raw.pct).toBeCloseTo(3.96, 2);
		expect(c.raw.osds).toBe(1);
		// MAX AVAIL is shared by every pool on the OSD, so it counts once.
		expect(c.writable).toBe(MAX_AVAIL);
		expect(c.writableCopies).toBe(1);
		expect(c.usable).toBeCloseTo(7.296e12, -9);
		expect(c.promised?.pct).toBeCloseTo(14.6, 1);
		// With one OSD the fullest is that OSD, the same share as raw.
		expect(c.fullest?.id).toBe('osd.0');
		expect(c.fullest?.pct).toBeCloseTo(c.raw.pct, 6);
	});

	it('divides promised bytes by usable space, not raw', () => {
		const c = capacity({
			rawTotal: 300,
			rawUsed: 0,
			pools: [{ stored: 0, maxAvail: 100, copies: 3 }],
			requested: 90,
			osds: []
		});
		expect(c.promised?.pct).toBe(90);
		expect(promisedLevel(c.promised!.pct)).toBe('orange');
	});

	it('picks the fullest of several OSDs and skips one with no size', () => {
		const c = capacity({
			rawTotal: 3,
			rawUsed: 1,
			pools: [],
			osds: [
				{ id: 'osd.0', used: 10, total: 100 },
				{ id: 'osd.4', used: 86, total: 100 },
				{ id: 'osd.9', used: 0, total: 0 }
			]
		});
		expect(c.fullest?.id).toBe('osd.4');
		expect(c.raw.osds).toBe(3);
	});

	it('leaves promised out when PVC requests are unknown', () => {
		expect(capacity({ rawTotal: 1, rawUsed: 0, pools: [], osds: [] }).promised).toBeUndefined();
	});
});

describe('levels', () => {
	it('colours raw capacity from 75 % and 85 %', () => {
		expect(rawLevel(74.9)).toBe('green');
		expect(rawLevel(75)).toBe('orange');
		expect(rawLevel(85)).toBe('red');
	});
	it('colours the fullest OSD by the cluster ratios', () => {
		expect(osdLevel(3.96, 0.85, 0.95)).toBe('green');
		expect(osdLevel(86, 0.85, 0.95)).toBe('orange');
		expect(osdLevel(95, 0.85, 0.95)).toBe('red');
		expect(osdLevel(86, 0.9, 0.97)).toBe('green');
	});
});

describe('growth and Full in', () => {
	it('reads no growth as Flat with no Full in', () => {
		expect(growth(0)).toEqual({ kind: 'flat', perDay: 0 });
		expect(growth(1_762_962 / 4)).toEqual({ kind: 'flat', perDay: 0 });
		expect(fullInDays(MAX_AVAIL, 0)).toBeUndefined();
		expect(fullInDays(MAX_AVAIL, -146_165)).toBeUndefined();
		expect(growth(-5 * MIB)?.kind).toBe('shrinking');
		expect(growth(undefined)).toBeUndefined();
	});

	it('gives the real data pool about 241 days at its 7-day average', () => {
		const perDay = 202_710_308_262 / 7;
		expect(fullInDays(MAX_AVAIL, perDay)).toBeCloseTo(241, 0);
	});

	it('fills the shared space sooner than any one pool', () => {
		const pools = [
			{ perDay: 202_710_308_262 / 7, copies: 1 },
			{ perDay: 21_973_661_617 / 7, copies: 1 },
			{ perDay: 0, copies: 1 }
		];
		const shared = sharedFullInDays(RAW_TOTAL, RAW_USED, 0.95, pools)!;
		expect(shared).toBeCloseTo(218, 0);
		expect(shared).toBeLessThan(fullInDays(MAX_AVAIL, pools[0].perDay)!);
	});

	it('counts each copy against the shared raw space', () => {
		expect(sharedFullInDays(1000, 0, 1, [{ perDay: 10 * MIB, copies: 3 }])).toBeCloseTo(
			1000 / (30 * MIB)
		);
	});

	it('has no shared Full in when nothing grows', () => {
		expect(sharedFullInDays(RAW_TOTAL, RAW_USED, 0.95, [{ perDay: 0 }, {}])).toBeUndefined();
		expect(fastestGrowing([pool({ id: '1', perDay: 10 })])).toBeUndefined();
	});
});

describe('pools', () => {
	it('reads copies from the pool description', () => {
		expect(parseRedundancy('replica:1')).toEqual({ copies: 1, label: '1×' });
		expect(parseRedundancy('replica:3')).toEqual({ copies: 3, label: '3×' });
		expect(parseRedundancy('ec:4+2')).toEqual({ copies: 1.5, label: 'EC 4+2' });
		expect(parseRedundancy(undefined)).toBeUndefined();
	});

	it('names services from the filesystem map and the application tag', () => {
		expect(
			serviceOf({ id: '6', name: 'ceph-filesystem-data0', application: 'Filesystem' }, FS)
		).toBe('cephfs-data');
		expect(serviceOf({ id: '5', name: 'ceph-filesystem-metadata' }, FS)).toBe('cephfs-metadata');
		expect(serviceOf({ id: '2', name: 'ceph-blockpool', application: 'Block' }, FS)).toBe('rbd');
		expect(serviceOf({ id: '10', name: '.rgw.root', application: 'Object' }, FS)).toBe('object');
		expect(serviceOf({ id: '1', name: '.mgr', application: 'mgr' }, FS)).toBe('system');
	});

	it('puts the pool that fills first on top, then the rest by size', () => {
		const rows = poolRows([
			pool({ id: '5', service: 'cephfs-metadata', stored: 10 * MIB, perDay: 0 }),
			pool({ id: '2', stored: 100 * GIB, perDay: 3 * GIB }),
			pool({ id: '6', service: 'cephfs-data', stored: 200 * GIB, perDay: 29 * GIB }),
			pool({ id: '7', service: 'system', stored: 50 * GIB })
		]);
		expect(rows.map((r) => r.id)).toEqual(['6', '2', '7', '5']);
		expect(rows[0].fullIn).toBeCloseTo(MAX_AVAIL / (29 * GIB), 6);
		expect(rows[2].growth).toBeUndefined();
		expect(rows[3].growth?.kind).toBe('flat');
	});

	it('folds the Object pools into one row of sums', () => {
		const rows = foldObjectPools(
			poolRows([
				pool({ id: '2', stored: 100 * GIB, perDay: 0, pvcs: 7 }),
				pool({ id: '1', service: 'object', stored: 4 * 1024, usedPct: 0.1, perDay: 0 }),
				pool({ id: '11', service: 'object', stored: 45 * 1024, usedPct: 0.2, perDay: 2 * MIB })
			])
		);
		expect(rows).toHaveLength(2);
		const group = rows.find((r) => r.members)!;
		expect(group.members?.map((r) => r.id)).toEqual(['11', '1']);
		expect(group.stored).toBe(49 * 1024);
		expect(group.usedPct).toBeCloseTo(0.3);
		expect(group.copiesLabel).toBe('1×');
		expect(group.fullIn).toBeCloseTo(MAX_AVAIL / (2 * MIB), 6);
		// A pool that will fill sorts above a larger one that will not.
		expect(rows[0]).toBe(group);
	});

	it('keeps a lone Object pool as itself', () => {
		const rows = poolRows([pool({ id: '1', service: 'object' })]);
		expect(rows[0].members).toBeUndefined();
	});
});

describe('PVCs per pool', () => {
	it('reads the pool from an RBD handle and the filesystem from a CephFS one', () => {
		expect(
			parseVolumeHandle('0001-0009-rook-ceph-0000000000000002-42e89095-43f1-4b83-bfa2-131f7e65b197')
		).toEqual({ location: 2 });
		expect(
			parseVolumeHandle(
				'0001-000d-my-cluster-01-000000000000001a-42e89095-43f1-4b83-bfa2-131f7e65b197'
			)
		).toEqual({ location: 26 });
		expect(parseVolumeHandle('pvc-123')).toBeUndefined();

		const counts = pvcsPerPool(
			[
				{
					driver: 'rook-ceph.rbd.csi.ceph.com',
					handle: '0001-0009-rook-ceph-0000000000000002-42e89095-43f1-4b83-bfa2-131f7e65b197'
				},
				{
					driver: 'rook-ceph.rbd.csi.ceph.com',
					handle: '0001-0009-rook-ceph-0000000000000002-e9e03401-0bfb-4ad8-b392-ee853a981464'
				},
				// fs_id 1 is ceph-filesystem, whose data lives in pool 6 — not pool 1.
				{
					driver: 'rook-ceph.cephfs.csi.ceph.com',
					handle: '0001-0009-rook-ceph-0000000000000001-47f51d09-e242-40cb-a837-d2b83d792343'
				},
				{ driver: 'topolvm.io', handle: 'abc' }
			],
			FS
		);
		expect(Object.fromEntries(counts)).toEqual({ '2': 2, '6': 1 });
	});
});

describe('placement groups', () => {
	it('puts every PG in active+clean when all are clean', () => {
		const g = groupPgs({
			total: 168,
			active: 168,
			clean: 168,
			degraded: 0,
			undersized: 0,
			recovering: 0,
			backfilling: 0
		});
		expect(g).toEqual({ total: 168, clean: 168, moving: 0, bad: 0, inactive: 0 });
	});

	it('splits recovering from degraded without counting a PG twice', () => {
		// 277 active+clean, 9 active+recovering+degraded, 3 active+undersized+degraded.
		const g = groupPgs({
			total: 289,
			active: 289,
			clean: 277,
			degraded: 12,
			undersized: 3,
			recovering: 9,
			backfilling: 0
		});
		expect(g).toEqual({ total: 289, clean: 277, moving: 9, bad: 3, inactive: 0 });
		expect(g.clean + g.moving + g.bad).toBe(g.total);
	});

	it('counts inactive PGs as bad even while they recover', () => {
		const g = groupPgs({
			total: 100,
			active: 90,
			clean: 85,
			degraded: 15,
			undersized: 0,
			recovering: 15,
			backfilling: 0
		});
		expect(g.inactive).toBe(10);
		expect(g.moving).toBe(5);
		expect(g.bad).toBe(10);
	});

	it('treats PGs queued for backfill as moving', () => {
		const g = groupPgs({
			total: 32,
			active: 32,
			clean: 28,
			degraded: 0,
			undersized: 0,
			recovering: 0,
			backfilling: 1,
			waiting: 3
		});
		expect(g).toMatchObject({ clean: 28, moving: 4, bad: 0 });
	});
});

describe('checkAge', () => {
	const now = 1_000_000;
	const week = 7 * DAY;
	it('counts from the last time the check read cleared', () => {
		expect(checkAge(now, week, 600, now - 3 * 3600, now - week)).toEqual({
			seconds: 3 * 3600,
			atLeast: false
		});
	});
	it('counts from the first active sample when the check is new', () => {
		// MON_DISK_LOW on the real cluster: first seen 120.7 h ago, never cleared.
		expect(checkAge(now, week, 600, undefined, now - 120.7 * 3600).seconds).toBeCloseTo(
			120.7 * 3600
		);
	});
	it('says "at least the window" for a check active all along', () => {
		expect(checkAge(now, week, 600, undefined, now - week)).toEqual({
			seconds: week,
			atLeast: true
		});
		expect(checkAge(now, week, 600, undefined, undefined).atLeast).toBe(true);
	});
});

describe('parseCephVersion', () => {
	it('reads the release name and number', () => {
		expect(
			parseCephVersion(
				'ceph version 20.2.4 (7f793731f1b39eb4f465e960113d2363c311b964) tentacle (stable - RelWithDebInfo)'
			)
		).toEqual({ release: 'Tentacle', version: '20.2.4' });
		expect(parseCephVersion('ceph version 19.2.2 squid')).toEqual({
			release: 'Squid',
			version: '19.2.2'
		});
		expect(parseCephVersion(undefined)).toBeUndefined();
	});
});

describe('splitPoolName', () => {
	it('keeps the last segment whole', () => {
		expect(splitPoolName('ceph-objectstore.rgw.buckets.data')).toEqual([
			'ceph-objectstore.rgw.buckets',
			'.data'
		]);
		expect(splitPoolName('ceph-objectstore.rgw.buckets.non-ec')).toEqual([
			'ceph-objectstore.rgw.buckets',
			'.non-ec'
		]);
		expect(splitPoolName('ceph-filesystem-data0')).toEqual(['ceph-filesystem', '-data0']);
		expect(splitPoolName('.mgr')).toEqual(['', '.mgr']);
	});
});

describe('which health checks count', () => {
	// The real cluster on 2026-11-25: one disk warning and five reminders.
	const real = [
		{ code: 'MON_DISK_LOW', error: false },
		{ code: 'AUTH_INSECURE_KEYS_ALLOWED', error: false },
		{ code: 'AUTH_INSECURE_CLIENT_KEY_TYPE', error: false },
		{ code: 'AUTH_INSECURE_KEYS_CREATABLE', error: false },
		{ code: 'POOL_NO_REDUNDANCY', error: false },
		{ code: 'TOO_FEW_OSDS', error: false }
	];

	it('keeps the monitor disk warning and sets the reminders aside', () => {
		expect(real.filter((c) => !isReminder(c)).map((c) => c.code)).toEqual(['MON_DISK_LOW']);
		expect(shownLevel(1, real)).toBe('warn');
	});

	it('reads Healthy when only reminders are left', () => {
		expect(shownLevel(1, real.slice(1))).toBe('ok');
	});

	it('never sets aside an error or an unknown code', () => {
		expect(isReminder({ code: 'POOL_NO_REDUNDANCY', error: true })).toBe(false);
		expect(isReminder({ code: 'SOMETHING_NEW', error: false })).toBe(false);
		expect(shownLevel(2, [{ code: 'PG_AVAILABILITY', error: true }])).toBe('err');
	});

	it("falls back to Ceph's status when no check is reported", () => {
		expect(shownLevel(1, [])).toBe('warn');
		expect(shownLevel(0, [])).toBe('ok');
	});
});
