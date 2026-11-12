import { describe, expect, it } from 'vitest';

import type { SharedMetrics } from '$lib/prometheus';

import { computeOverviewWidgets } from './widgets';

const shared = {} as SharedMetrics;

describe('computeOverviewWidgets', () => {
	it('keeps the KubeVirt component tiles for everyone, fed by the shared scope', () => {
		const widgets = computeOverviewWidgets(shared);
		for (const key of ['controller', 'worker']) {
			expect(widgets.find((w) => w.key === key)?.props).toEqual({ shared });
		}
		expect(widgets.map((w) => w.key)).toContain('cpu');
		expect(widgets.find((w) => w.key === 'cpu')?.props).toBeUndefined();
	});
});
