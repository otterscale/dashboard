import { describe, expect, it } from 'vitest';

import type { Sample } from '$lib/components/dashboard/kit/fetch';

import { DAY, GIB, MIB } from '../../overview/ceph';
import {
	buildOsds,
	buildPools,
	buildPvcs,
	diskModel,
	filesOf,
	manyPgs,
	notMounted,
	poolOfVolume,
	pvcLevel,
	slowWrites,
	soleDeviceClass
} from './model';

const s = (labels: Record<string, string>, value = 1): Sample => ({ labels, value });

// Volume handles as Ceph CSI writes them: the 16-hex field is the pool ID (RBD) or fs ID (CephFS).
const RBD_HANDLE = '0001-0009-rook-ceph-0000000000000002-7c1f9a4e-1111-2222-3333-444455556666';
const FS_HANDLE = '0001-0009-rook-ceph-0000000000000001-47f51d09-e242-40cb-a837-d2b83d792343';
const FILESYSTEMS = [
	s({ fs_id: '1', name: 'ceph-filesystem', data_pools: '6', metadata_pool: '5' })
];

describe('buildPools', () => {
	const meta = (id: string, name: string, application: string) =>
		s({ pool_id: id, name, application, description: 'replica:3', compression_mode: 'none' });

	it('puts the pool that fills first on top, then the rest by stored', () => {
		const pools = buildPools({
			meta: [
				meta('1', 'small', 'Object'),
				meta('2', 'rbd', 'Block'),
				meta('6', 'data', 'Filesystem')
			],
			stored: [s({ pool_id: '1' }, MIB), s({ pool_id: '2' }, 10 * GIB), s({ pool_id: '6' }, GIB)],
			maxAvail: [
				s({ pool_id: '1' }, 100 * GIB),
				s({ pool_id: '2' }, 100 * GIB),
				s({ pool_id: '6' }, 100 * GIB)
			],
			percentUsed: [],
			perDay: [s({ pool_id: '6' }, 2 * GIB)],
			filesystems: FILESYSTEMS,
			pgs: [s({ pool_id: '2' }, 32)],
			storedRaw: []
		});
		expect(pools.map((p) => p.name)).toEqual(['data', 'rbd', 'small']);
		expect(pools[0].fullIn).toBe(50);
		expect(pools[0].service).toBe('cephfs-data');
		expect(pools[1]).toMatchObject({ service: 'rbd', copies: 3, pgs: 32, compression: 'none' });
	});
});

describe('soleDeviceClass', () => {
	it('names the class only when every OSD shares it', () => {
		expect(soleDeviceClass([s({ device_class: 'nvme' }, 9)])).toBe('nvme');
		expect(soleDeviceClass([s({ device_class: 'nvme' }), s({ device_class: 'hdd' })])).toBe(
			undefined
		);
		expect(soleDeviceClass([])).toBe(undefined);
	});
});

describe('buildOsds', () => {
	it('sorts by the fullest, then by number, and averages placement groups', () => {
		const { osds, cluster } = buildOsds({
			meta: [
				s({ ceph_daemon: 'osd.10', hostname: 'a' }),
				s({ ceph_daemon: 'osd.2', hostname: 'b' }),
				s({ ceph_daemon: 'osd.9', hostname: 'a' })
			],
			used: [
				s({ ceph_daemon: 'osd.10' }, 30),
				s({ ceph_daemon: 'osd.2' }, 86),
				s({ ceph_daemon: 'osd.9' }, 30)
			],
			total: [
				s({ ceph_daemon: 'osd.10' }, 100),
				s({ ceph_daemon: 'osd.2' }, 100),
				s({ ceph_daemon: 'osd.9' }, 100)
			],
			up: [s({ ceph_daemon: 'osd.2' }, 1)],
			in: [s({ ceph_daemon: 'osd.2' }, 0)],
			pgs: [s({ ceph_daemon: 'osd.2' }, 120), s({ ceph_daemon: 'osd.9' }, 90)],
			nearfull: [s({}, 0.85)],
			full: [s({}, 0.95)]
		});
		expect(osds.map((o) => o.id)).toEqual(['osd.2', 'osd.9', 'osd.10']);
		expect(osds[0]).toMatchObject({ pct: 86, up: true, in: false, host: 'b' });
		expect(osds[1].up).toBe(undefined);
		expect(cluster).toMatchObject({ nearfull: 0.85, full: 0.95, avgPgs: 105 });
	});

	it('handles a single OSD', () => {
		const { osds } = buildOsds({
			meta: [s({ ceph_daemon: 'osd.0' })],
			used: [s({ ceph_daemon: 'osd.0' }, 4)],
			total: [s({ ceph_daemon: 'osd.0' }, 100)]
		});
		expect(osds).toHaveLength(1);
		expect(osds[0].pct).toBe(4);
	});
});

describe('OSD warnings', () => {
	it('flags writes well above the cluster, never a lone OSD against itself', () => {
		expect(slowWrites(6.8, 2.6)).toBe(true);
		expect(slowWrites(2.3, 2.3)).toBe(false);
		expect(slowWrites(1.2, 0.6)).toBe(false); // half again, but under a millisecond more
		expect(slowWrites(undefined, 2)).toBe(false);
	});

	it('flags placement groups above the average', () => {
		expect(manyPgs(112, 98)).toBe(true);
		expect(manyPgs(168, 168)).toBe(false);
	});
});

describe('diskModel', () => {
	it('joins the disk to node_exporter through the host', () => {
		const hosts = [s({ instance: '10.0.0.1:9100', nodename: 'node-a' })];
		const models = [
			s({ instance: '10.0.0.1:9100', device: 'nvme2n1', model: 'PASCARI DP20' }),
			s({ instance: '10.0.0.2:9100', device: 'nvme2n1', model: 'Other' })
		];
		expect(diskModel('/dev/nvme2n1', 'node-a', hosts, models)).toBe('PASCARI DP20');
		expect(diskModel('/dev/nvme2n1', 'node-b', hosts, models)).toBe(undefined);
		expect(diskModel(undefined, 'node-a', hosts, models)).toBe(undefined);
	});
});

describe('poolOfVolume', () => {
	const filesystems = [{ id: '1', name: 'fs', dataPools: ['6'], metadataPool: '5' }];
	it('reads the pool from an RBD handle and the data pool from a CephFS one', () => {
		expect(poolOfVolume('rook-ceph.rbd.csi.ceph.com', RBD_HANDLE, filesystems)).toBe('2');
		expect(poolOfVolume('rook-ceph.cephfs.csi.ceph.com', FS_HANDLE, filesystems)).toBe('6');
		expect(poolOfVolume('topolvm.io', RBD_HANDLE, filesystems)).toBe(undefined);
	});
});

describe('buildPvcs', () => {
	const claim = (ns: string, name: string, sc: string, volume: string) =>
		s({ namespace: ns, persistentvolumeclaim: name, storageclass: sc, volumename: volume });
	const k = (ns: string, name: string) => ({ namespace: ns, persistentvolumeclaim: name });
	const now = 1_800_000_000;
	const pvcs = buildPvcs({
		claims: [
			claim('db', 'pg', 'ceph-block', 'pv-1'),
			claim('ai', 'model-cache', 'ceph-filesystem', 'pv-2'),
			claim('ai', 'fresh', 'ceph-block', 'pv-3'),
			claim('ai', 'full', 'ceph-block', 'pv-4')
		],
		volumes: [
			s({
				persistentvolume: 'pv-1',
				csi_driver: 'rook-ceph.rbd.csi.ceph.com',
				csi_volume_handle: RBD_HANDLE
			}),
			s({
				persistentvolume: 'pv-2',
				csi_driver: 'rook-ceph.cephfs.csi.ceph.com',
				csi_volume_handle: FS_HANDLE
			})
		],
		filesystems: FILESYSTEMS,
		pools: [s({ pool_id: '2', name: 'ceph-blockpool' }), s({ pool_id: '6', name: 'data0' })],
		used: [
			s(k('db', 'pg'), 40 * GIB),
			s(k('ai', 'model-cache'), 80 * GIB),
			s(k('ai', 'full'), 95 * GIB)
		],
		capacity: [
			s(k('db', 'pg'), 100 * GIB),
			s(k('ai', 'model-cache'), 100 * GIB),
			s(k('ai', 'full'), 100 * GIB)
		],
		requested: [],
		live: [s(k('db', 'pg')), s(k('ai', 'full'))],
		lastSeen: [
			s(k('db', 'pg'), now),
			s(k('ai', 'model-cache'), now - 2 * DAY),
			s(k('ai', 'full'), now)
		],
		perDay: [s(k('db', 'pg'), 2 * GIB), s(k('ai', 'model-cache'), 50 * GIB)],
		inodesUsed: [s(k('db', 'pg'), 3686), s(k('ai', 'model-cache'), 0)],
		inodes: [s(k('db', 'pg'), 6_553_600), s(k('ai', 'model-cache'), 0)],
		access: [
			s({ ...k('ai', 'model-cache'), access_mode: 'ReadWriteMany' }),
			s({ ...k('db', 'pg'), access_mode: 'ReadWriteOnce' })
		],
		created: [s(k('db', 'pg'), now - 30 * DAY)],
		mounts: [s({ ...k('db', 'pg'), pod: 'pg-0' })],
		now: [s({}, now)]
	});
	const byName = (name: string) => pvcs.find((p) => p.name === name)!;

	it('places each PVC in its pool', () => {
		expect(byName('pg')).toMatchObject({ poolId: '2', poolName: 'ceph-blockpool' });
		expect(byName('model-cache')).toMatchObject({ poolId: '6', poolName: 'data0' });
		expect(byName('fresh').poolId).toBe(undefined);
	});

	it('gives an unmounted PVC its last size but no growth', () => {
		const cache = byName('model-cache');
		expect(cache).toMatchObject({ live: false, pct: 80, lastSeenAgo: 2 * DAY });
		expect(cache.growth).toBe(undefined);
		expect(cache.fullIn).toBe(undefined);
		expect(notMounted(cache)).toBe(true);
	});

	it('sorts the PVC that fills first on top, then the fullest, then the unreported', () => {
		expect(pvcs.map((p) => p.name)).toEqual(['pg', 'full', 'model-cache', 'fresh']);
		expect(byName('pg').fullIn).toBe(30);
		expect(byName('fresh').used).toBe(undefined);
	});

	it('keeps access modes and the Pods that mount it', () => {
		expect(byName('pg')).toMatchObject({ accessModes: ['ReadWriteOnce'], mountedBy: ['pg-0'] });
		expect(byName('model-cache').mountedBy).toEqual([]);
	});

	it('counts files only where the volume reports inodes', () => {
		expect(filesOf(byName('pg'))).toMatchObject({ kind: 'count', used: 3686, total: 6_553_600 });
		expect(filesOf(byName('model-cache'))).toEqual({ kind: 'none' });
	});
});

describe('pvcLevel', () => {
	it('warns from 80 % and is critical from 90 %', () => {
		expect(pvcLevel(79.9)).toBe('green');
		expect(pvcLevel(80)).toBe('orange');
		expect(pvcLevel(90)).toBe('red');
	});
});
