import { describe, expect, it, vi } from 'vitest';

import { canViewClusterMetrics, CLUSTER_METRICS_ACCESS } from './metrics-access';

function fakeFetch(response: Response | Error) {
	return vi.fn(async () => {
		if (response instanceof Error) throw response;
		return response;
	}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const allowed = (value: boolean) =>
	new Response(JSON.stringify({ object: { status: { allowed: value } } }), { status: 200 });

describe('canViewClusterMetrics', () => {
	it('asks the hub for the exact attribute the server checks', async () => {
		const f = fakeFetch(allowed(true));
		await expect(canViewClusterMetrics(f, 'c1')).resolves.toBe(true);

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

	it('is false when denied, on errors and on odd answers', async () => {
		await expect(canViewClusterMetrics(fakeFetch(allowed(false)), 'c1')).resolves.toBe(false);
		await expect(
			canViewClusterMetrics(fakeFetch(new Response('', { status: 500 })), 'c1')
		).resolves.toBe(false);
		await expect(canViewClusterMetrics(fakeFetch(new Error('down')), 'c1')).resolves.toBe(false);
		await expect(
			canViewClusterMetrics(fakeFetch(new Response('{}', { status: 200 })), 'c1')
		).resolves.toBe(false);
	});

	it('logs why a failure read as no, but not a denial', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(
				canViewClusterMetrics(fakeFetch(new Response('', { status: 503 })), 'c1')
			).resolves.toBe(false);
			expect(log).toHaveBeenCalledTimes(1);
			expect(String(log.mock.calls[0][0])).toMatch(/c1.*503/);

			log.mockClear();
			const down = new Error('down');
			await expect(canViewClusterMetrics(fakeFetch(down), 'c1')).resolves.toBe(false);
			expect(log).toHaveBeenCalledTimes(1);
			expect(String(log.mock.calls[0][0])).toContain('c1');
			expect(log.mock.calls[0]).toContain(down);

			log.mockClear();
			await expect(canViewClusterMetrics(fakeFetch(allowed(false)), 'c1')).resolves.toBe(false);
			expect(log).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
});
