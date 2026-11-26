import { describe, expect, it } from 'vitest';

import {
	canOpen,
	DEPLOYMENT,
	detailLink,
	exactRegex,
	namesLink,
	phaseListLink,
	POD,
	PVC,
	tooltipNames
} from './links';

function params(search: string): Record<string, string> {
	return Object.fromEntries(new URLSearchParams(search));
}

describe('exactRegex', () => {
	it('anchors the names in one alternation, sorted and without duplicates', () => {
		expect(exactRegex(['qwen-kserve', 'kjhk-kserve', 'qwen-kserve'])).toBe(
			'/^(kjhk-kserve|qwen-kserve)$/'
		);
	});

	it('escapes characters a name may contain that mean something in a regex', () => {
		expect(exactRegex(['a.b'])).toBe('/^(a\\.b)$/');
	});
});

describe('detailLink', () => {
	it('opens the detail page with the kind and the namespace', () => {
		const target = detailLink(PVC, 'db286l', 'hf-cache');
		expect(target.name).toBe('hf-cache');
		expect(params(target.search)).toEqual({
			group: '',
			version: 'v1',
			kind: 'PersistentVolumeClaim',
			resource: 'persistentvolumeclaims',
			namespace: 'db286l'
		});
	});
});

describe('namesLink', () => {
	it('is no link for no names', () => {
		expect(namesLink(POD, 'db286l', [])).toBeNull();
	});

	it('opens the detail page for one name, also when it repeats', () => {
		const target = namesLink(POD, 'db286l', ['kjhk-0', 'kjhk-0']);
		expect(target?.name).toBe('kjhk-0');
		expect(params(target!.search).namespace).toBe('db286l');
	});

	it('opens the list filtered to the namespace and the exact names for several', () => {
		const target = namesLink(DEPLOYMENT, 'db286l', ['qwen-kserve', 'kjhk-kserve']);
		expect(target?.name).toBeUndefined();
		expect(params(target!.search)).toEqual({
			group: 'apps',
			version: 'v1',
			kind: 'Deployment',
			resource: 'deployments',
			query: 'Namespace:db286l AND Name:/^(kjhk-kserve|qwen-kserve)$/'
		});
	});

	it('encodes the query the way the list page writes it', () => {
		const target = namesLink(POD, 'db286l', ['a', 'b']);
		expect(target!.search).toContain('query=Namespace%3Adb286l+AND+Name%3A%2F%5E%28a%7Cb%29%24%2F');
	});
});

describe('phaseListLink', () => {
	it('filters on status.phase, not the Status column', () => {
		expect(params(phaseListLink(POD, 'db286l', 'Pending').search).query).toBe(
			'Namespace:db286l AND raw.status.phase:Pending'
		);
	});
});

describe('canOpen', () => {
	const rule = (apiGroups: string[], resources: string[], verbs: string[]) => ({
		apiGroups,
		resources,
		verbs
	});

	it('allows a kind the rules grant list and get on', () => {
		expect(
			canOpen({ resourceRules: [rule(['apps'], ['deployments'], ['get', 'list'])] }, DEPLOYMENT)
		).toBe(true);
	});

	it('accepts wildcards', () => {
		expect(canOpen({ resourceRules: [rule(['*'], ['*'], ['*'])] }, POD)).toBe(true);
	});

	it('denies a kind the complete rules do not grant', () => {
		expect(canOpen({ resourceRules: [rule([''], ['pods'], ['get'])] }, POD)).toBe(false);
		expect(canOpen({ resourceRules: [rule(['apps'], ['deployments'], ['*'])] }, POD)).toBe(false);
	});

	it('keeps the link when the rules are incomplete or missing', () => {
		expect(canOpen({ resourceRules: [], incomplete: true }, POD)).toBe(true);
		expect(canOpen(undefined, POD)).toBe(true);
	});
});

describe('tooltipNames', () => {
	it('lists up to five names and counts the rest', () => {
		expect(tooltipNames(['f', 'e', 'd', 'c', 'b', 'a', 'a'])).toEqual({
			shown: ['a', 'b', 'c', 'd', 'e'],
			more: 1
		});
		expect(tooltipNames(['b', 'a'])).toEqual({ shown: ['a', 'b'], more: 0 });
	});
});
