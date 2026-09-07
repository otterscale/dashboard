import { describe, expect, it, vi } from 'vitest';

import { createRancherProjectLoader, rancherProjectSecondaryText } from './rancher-project';

describe('createRancherProjectLoader', () => {
	it('shares an in-flight request and reloads after it settles', async () => {
		let resolve!: (projects: { id: string; displayName: string }[]) => void;
		const request = vi.fn(
			() =>
				new Promise<{ id: string; displayName: string }[]>((done) => {
					resolve = done;
				})
		);
		const load = createRancherProjectLoader(request);

		const first = load();
		const concurrent = load();
		expect(concurrent).toBe(first);
		expect(request).toHaveBeenCalledTimes(1);

		resolve([{ id: 'local:p-default', displayName: 'Default' }]);
		await expect(first).resolves.toHaveLength(1);

		const next = load();
		expect(request).toHaveBeenCalledTimes(2);
		resolve([]);
		await expect(next).resolves.toEqual([]);
	});

	it('allows retry after an error', async () => {
		const request = vi
			.fn<() => Promise<{ id: string; displayName: string }[]>>()
			.mockRejectedValueOnce(new Error('cache not ready'))
			.mockResolvedValueOnce([]);
		const load = createRancherProjectLoader(request);

		await expect(load()).rejects.toThrow('cache not ready');
		await expect(load()).resolves.toEqual([]);
		expect(request).toHaveBeenCalledTimes(2);
	});
});

describe('Rancher Project mapping', () => {
	it('shows a secondary display name only when it differs from the resource name', () => {
		expect(rancherProjectSecondaryText({ id: 'c-m-cluster:p-team', displayName: 'AI Team' })).toBe(
			'AI Team'
		);
		expect(rancherProjectSecondaryText({ id: 'c-m-cluster:p-team', displayName: 'p-team' })).toBe(
			''
		);
	});
});
