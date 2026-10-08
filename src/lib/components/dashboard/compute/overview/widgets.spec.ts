import { describe, expect, it } from 'vitest';

import { computeOverviewWidgets } from './widgets';

describe('computeOverviewWidgets', () => {
	it('keeps the KubeVirt component tiles for cluster viewers', () => {
		expect(computeOverviewWidgets(true).map((w) => w.key)).toContain('controller');
		expect(computeOverviewWidgets(true).map((w) => w.key)).toContain('worker');
	});

	it('drops them for everyone else', () => {
		const keys = computeOverviewWidgets(false).map((w) => w.key);
		expect(keys).not.toContain('controller');
		expect(keys).not.toContain('worker');
		expect(keys).toContain('cpu');
	});
});
