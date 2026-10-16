import { describe, expect, it, vi } from 'vitest';

import { checkClusterMetricsAccess, CLUSTER_METRICS_ACCESS } from './metrics-access';

type Step = () => Response | Error;

/** A fetch that answers with each step in turn; the last one repeats. */
function fakeFetch(...steps: Step[]) {
	let call = 0;
	return vi.fn(async () => {
		const answer = steps[Math.min(call++, steps.length - 1)]();
		if (answer instanceof Error) throw answer;
		return answer;
	}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const allowed =
	(value: boolean): Step =>
	() =>
		new Response(JSON.stringify({ object: { status: { allowed: value } } }), { status: 200 });
const status =
	(code: number): Step =>
	() =>
		new Response('', { status: code });

describe('checkClusterMetricsAccess', () => {
	it('asks the hub for the exact attribute the server checks', async () => {
		const f = fakeFetch(allowed(true));
		await expect(checkClusterMetricsAccess(f, 'c1')).resolves.toBe('allowed');

		const [url, init] = f.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/otterscale.resource.v1.ResourceService/Create');
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			cluster: 'c1',
			group: 'authorization.k8s.io',
			version: 'v1',
			resource: 'selfsubjectaccessreviews'
		});
		const manifest = JSON.parse(atob(body.manifest));
		expect(manifest.kind).toBe('SelfSubjectAccessReview');
		expect(manifest.spec.resourceAttributes).toEqual(CLUSTER_METRICS_ACCESS);
		expect(CLUSTER_METRICS_ACCESS).toEqual({
			verb: 'get',
			group: 'monitoring.coreos.com',
			resource: 'prometheuses',
			subresource: 'api',
			namespace: 'monitoring',
			name: 'prometheus-stack-kube-prom-prometheus'
		});
	});

	it('takes a denial at its word: no retry, no log', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const f = fakeFetch(allowed(false));
			await expect(checkClusterMetricsAccess(f, 'c1')).resolves.toBe('denied');
			expect(f).toHaveBeenCalledTimes(1);

			const odd = fakeFetch(() => new Response('{}', { status: 200 }));
			await expect(checkClusterMetricsAccess(odd, 'c1')).resolves.toBe('denied');
			expect(odd).toHaveBeenCalledTimes(1);
			expect(log).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it('asks once more after a failure', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const f = fakeFetch(status(503), allowed(true));
			await expect(checkClusterMetricsAccess(f, 'c1')).resolves.toBe('allowed');
			expect(f).toHaveBeenCalledTimes(2);

			const thrown = fakeFetch(() => new Error('blip'), allowed(true));
			await expect(checkClusterMetricsAccess(thrown, 'c1')).resolves.toBe('allowed');
			expect(thrown).toHaveBeenCalledTimes(2);
			expect(log).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it('is unknown after two failures, and logs why once', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const f = fakeFetch(status(503));
			await expect(checkClusterMetricsAccess(f, 'c1')).resolves.toBe('unknown');
			expect(f).toHaveBeenCalledTimes(2);
			expect(log).toHaveBeenCalledTimes(1);
			expect(String(log.mock.calls[0][0])).toContain('c1');
			expect(log.mock.calls[0][1]).toBe('HTTP 503');

			log.mockClear();
			const down = new Error('down');
			await expect(
				checkClusterMetricsAccess(
					fakeFetch(() => down),
					'c1'
				)
			).resolves.toBe('unknown');
			expect(log).toHaveBeenCalledTimes(1);
			expect(log.mock.calls[0][1]).toBe(down);

			log.mockClear();
			const garbled = fakeFetch(() => new Response('not json', { status: 200 }));
			await expect(checkClusterMetricsAccess(garbled, 'c1')).resolves.toBe('unknown');
			expect(log).toHaveBeenCalledTimes(1);
		} finally {
			log.mockRestore();
		}
	});
});
