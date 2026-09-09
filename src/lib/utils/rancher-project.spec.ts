import { describe, expect, it } from 'vitest';

import { applyRancherProjectID, findRancherProjectID } from './rancher-project';

describe('Rancher Project mapping', () => {
	it('finds only the exact cluster Link', () => {
		const links = [
			{ cluster: 'production', rancherProjectId: 'c-m-cluster:p-prod' },
			{ cluster: 'production-canary', rancherProjectId: 'c-m-cluster:p-canary' }
		];
		expect(findRancherProjectID(links, 'production')).toBe('c-m-cluster:p-prod');
		expect(findRancherProjectID(links, 'prod')).toBeUndefined();
	});

	it('includes the Workspace field only for a non-empty Link value', () => {
		const withProject = applyRancherProjectID({ spec: {} }, 'local:p-default');
		const withoutProject = applyRancherProjectID({ spec: {} }, '');

		expect(withProject.spec).toEqual({ rancherProjectID: 'local:p-default' });
		expect(withoutProject.spec).toEqual({});
	});
});
