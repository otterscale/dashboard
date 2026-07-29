import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { applyDeltaToYamlText, computeValuesDelta, normalizeYamlText } from './helm-values';

describe('computeValuesDelta', () => {
	const defaults = {
		replicas: 1,
		image: { repository: 'nginx', tag: 'latest' },
		resources: { limits: { cpu: '100m', memory: '128Mi' } },
		tolerations: [{ key: 'a' }],
		auth: { existingSecret: '' }
	};

	it('returns empty object when nothing changed', () => {
		expect(computeValuesDelta(defaults, structuredClone(defaults))).toEqual({});
	});

	it('keeps only changed keys, recursing into objects', () => {
		const edited = structuredClone(defaults);
		edited.replicas = 3;
		edited.resources.limits.cpu = '200m';
		expect(computeValuesDelta(defaults, edited)).toEqual({
			replicas: 3,
			resources: { limits: { cpu: '200m' } }
		});
	});

	it('treats arrays as whole values', () => {
		const edited = structuredClone(defaults);
		edited.tolerations = [{ key: 'a' }, { key: 'b' }];
		expect(computeValuesDelta(defaults, edited)).toEqual({
			tolerations: [{ key: 'a' }, { key: 'b' }]
		});
	});

	it('keeps explicit null overrides (helm "remove default" semantics)', () => {
		const edited = structuredClone(defaults) as Record<string, unknown>;
		edited.auth = null;
		expect(computeValuesDelta(defaults, edited)).toEqual({ auth: null });
	});

	it('records new keys absent from defaults', () => {
		const edited = { ...structuredClone(defaults), extraEnv: { FOO: 'bar' } };
		expect(computeValuesDelta(defaults, edited)).toEqual({ extraEnv: { FOO: 'bar' } });
	});

	it('compares Date values by time (js-yaml parses YAML timestamps into Date)', () => {
		const withDate = { ...structuredClone(defaults), notBefore: new Date('2026-01-01') };
		const sameDate = { ...structuredClone(defaults), notBefore: new Date('2026-01-01') };
		const changedDate = { ...structuredClone(defaults), notBefore: new Date('2026-06-01') };
		expect(computeValuesDelta(withDate, sameDate)).toEqual({});
		expect(computeValuesDelta(withDate, changedDate)).toEqual({
			notBefore: new Date('2026-06-01')
		});
	});

	it('is idempotent when the input is already a delta', () => {
		const delta = { replicas: 3, resources: { limits: { cpu: '200m' } } };
		expect(computeValuesDelta(defaults, delta)).toEqual(delta);
	});
});

describe('applyDeltaToYamlText', () => {
	const yamlText = [
		'# Number of replicas',
		'replicas: 1',
		'image:',
		'  # Container image repository',
		'  repository: nginx',
		'  tag: latest',
		'tolerations: []',
		''
	].join('\n');

	it('applies scalar overrides while preserving comments', () => {
		const merged = applyDeltaToYamlText(yamlText, { replicas: 3 });
		expect(merged).toContain('# Number of replicas');
		expect(merged).toContain('replicas: 3');
		expect(merged).toContain('# Container image repository');
	});

	it('descends into mappings and adds new keys', () => {
		const merged = applyDeltaToYamlText(yamlText, {
			image: { tag: '1.25' },
			extraEnv: { FOO: 'bar' }
		});
		expect(parse(merged)).toEqual({
			replicas: 1,
			image: { repository: 'nginx', tag: '1.25' },
			tolerations: [],
			extraEnv: { FOO: 'bar' }
		});
		expect(merged).toContain('# Container image repository');
	});

	it('replaces arrays wholesale', () => {
		const merged = applyDeltaToYamlText(yamlText, { tolerations: [{ key: 'a' }] });
		expect(parse(merged).tolerations).toEqual([{ key: 'a' }]);
	});

	it('round-trips: delta of merged text against defaults equals the delta', () => {
		const delta = { replicas: 3, image: { tag: '1.25' }, extraEnv: { FOO: 'bar' } };
		const merged = applyDeltaToYamlText(yamlText, delta);
		expect(computeValuesDelta(parse(yamlText), parse(merged))).toEqual(delta);
	});

	it('does not fold long scalars onto continuation lines', () => {
		const longUrl =
			'http://otterscale-prometheus-kube-prometheus.monitoring.svc.cluster.local:9090';
		const merged = applyDeltaToYamlText(yamlText, { prometheus: { url: longUrl } });
		expect(merged).toContain(`url: ${longUrl}\n`);
		expect(merged).not.toContain('\\\n');
	});
});

describe('normalizeYamlText', () => {
	// Trailing comments padded for alignment, plus a scalar past the default
	// 80-column fold width — both get reflowed by the printer.
	const yamlText = [
		'backend:',
		'  imageTag: ""            # empty falls back to Chart.appVersion',
		'prometheus:',
		'  url: "http://otterscale-prometheus-kube-prometheus.monitoring.svc.cluster.local:9090"',
		''
	].join('\n');

	it('matches the printed form of an unmodified merge, so the diff stays clean', () => {
		expect(normalizeYamlText(yamlText)).toBe(applyDeltaToYamlText(yamlText, {}));
	});

	it('is idempotent', () => {
		const once = normalizeYamlText(yamlText);
		expect(normalizeYamlText(once)).toBe(once);
	});

	it('preserves values and comments', () => {
		const normalized = normalizeYamlText(yamlText);
		expect(parse(normalized)).toEqual(parse(yamlText));
		expect(normalized).toContain('# empty falls back to Chart.appVersion');
	});
});
