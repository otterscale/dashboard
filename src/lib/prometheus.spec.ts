import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
	classifyGpuGovernance,
	clusterPrometheusDriver,
	namespacePrometheusDriver,
	workspacePrometheusDriver
} from './prometheus';

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

describe('classifyGpuGovernance', () => {
	it('stays quiet when either side is missing', () => {
		// No HAMi: nothing booked the card, which is not the same as booking zero.
		expect(classifyGpuGovernance(undefined, 5 * GIB)).toEqual({ level: 'managed' });
		// No DCGM: nothing to compare the booking against.
		expect(classifyGpuGovernance(8 * GIB, undefined)).toEqual({ level: 'managed' });
		expect(classifyGpuGovernance(NaN, 5 * GIB)).toEqual({ level: 'managed' });
	});

	it('reports usage above the booking as unmanaged', () => {
		// A pod that escaped HAMi (NVIDIA_VISIBLE_DEVICES=all) shows up on the card but not in
		// the scheduler's books.
		expect(classifyGpuGovernance(0, 5 * GIB)).toEqual({ level: 'unmanaged', bytes: 5 * GIB });
		expect(classifyGpuGovernance(2 * GIB, 6 * GIB)).toEqual({
			level: 'unmanaged',
			bytes: 4 * GIB
		});
	});

	it('ignores a small excess as rounding noise', () => {
		// DCGM reports whole MiB and HAMi books whole MB, so the two never agree exactly.
		expect(classifyGpuGovernance(8 * GIB, 8 * GIB + 100 * MIB)).toEqual({ level: 'managed' });
	});

	it('reports a large booking with little usage as idle', () => {
		expect(classifyGpuGovernance(8 * GIB, 1 * MIB)).toEqual({
			level: 'idle',
			bytes: 8 * GIB - MIB
		});
	});

	it('does not call a sub-GiB idle gap a finding', () => {
		expect(classifyGpuGovernance(8 * GIB, 7.5 * GIB)).toEqual({ level: 'managed' });
	});

	it('classifies the observed dev-cluster reading as idle', () => {
		// 7.81 GiB booked by a kserve pod, 1 MiB actually resident on the card.
		const governance = classifyGpuGovernance(8_388_608_000, 1_048_576);
		expect(governance.level).toBe('idle');
		expect(governance).toHaveProperty('bytes', 8_388_608_000 - 1_048_576);
	});
});

describe('prometheus drivers', () => {
	let server: Server;
	let origin = '';
	const seen: URL[] = [];

	beforeAll(async () => {
		server = createServer((req: IncomingMessage, res) => {
			const url = new URL(req.url ?? '/', 'http://x');
			seen.push(url);
			// series and label endpoints answer with a bare array, query endpoints with a result.
			const data = /\/(series|label\/)/.test(url.pathname)
				? []
				: { resultType: 'vector', result: [] };
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ status: 'success', data }));
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

	it('namespace scope adds namespace to every request', async () => {
		seen.length = 0;
		const driver = namespacePrometheusDriver('c1', 'ws-a', origin);
		await driver.instantQuery('up');
		await driver.rangeQuery('up', new Date(0), new Date(60_000), 15);
		await driver.series('up', new Date(0), new Date(60_000));
		await driver.labelValues('pod');

		expect(seen.map((u) => u.pathname)).toEqual([
			'/proxy/c1/prometheus-tenancy/api/v1/query',
			'/proxy/c1/prometheus-tenancy/api/v1/query_range',
			'/proxy/c1/prometheus-tenancy/api/v1/series',
			'/proxy/c1/prometheus-tenancy/api/v1/label/pod/values'
		]);
		for (const u of seen) expect(u.searchParams.getAll('namespace')).toEqual(['ws-a']);
		expect(seen[0].searchParams.get('query')).toBe('up');
	});

	it('cluster scope sends no namespace', async () => {
		seen.length = 0;
		await clusterPrometheusDriver('c1', origin).instantQuery('up');
		expect(seen[0].pathname).toBe('/proxy/c1/prometheus/api/v1/query');
		expect(seen[0].searchParams.has('namespace')).toBe(false);
	});

	it('workspace pages pick the scope by access', () => {
		expect(workspacePrometheusDriver('c1', 'ws-a', false)).not.toBeNull();
		expect(workspacePrometheusDriver('c1', '', false)).toBeNull();
		expect(workspacePrometheusDriver('c1', '', true)).not.toBeNull();
	});
});
