import { describe, expect, it } from 'vitest';

import { formatDuration } from '$lib/components/dashboard/kit/format';

import { describeAlert, isCatalogued, locatingLabels, subjectPod } from './alert-catalog';

describe('describeAlert', () => {
	it('fills a catalogued alert from its labels', () => {
		const { title } = describeAlert({
			name: 'KubeNodeNotReady',
			severity: 'warning',
			labels: { alertname: 'KubeNodeNotReady', node: 'gpu-02' }
		});
		expect(isCatalogued('KubeNodeNotReady')).toBe(true);
		expect(title).toContain('gpu-02');
	});

	it('reads a label the rule did not set as a dash, not "undefined"', () => {
		const { title, description } = describeAlert({
			name: 'KubePodCrashLooping',
			severity: 'warning',
			labels: { alertname: 'KubePodCrashLooping', pod: 'web-1' }
		});
		expect(`${title} ${description}`).not.toContain('undefined');
		expect(description).toContain('—');
	});

	it('falls back to the alertname and the labels that locate it', () => {
		const alert = {
			name: 'SomethingCustom',
			severity: 'critical',
			labels: { alertname: 'SomethingCustom', namespace: 'team-a', pod: 'api-0', prometheus: 'x' }
		};
		expect(isCatalogued('SomethingCustom')).toBe(false);
		expect(describeAlert(alert)).toEqual({
			title: 'SomethingCustom',
			description: 'namespace team-a · pod api-0'
		});
	});

	it('does not treat Object.prototype keys as catalogued', () => {
		expect(isCatalogued('constructor')).toBe(false);
		expect(locatingLabels({})).toBe('');
	});
});

describe('subjectPod', () => {
	// KubeJobFailed as kube-prometheus-stack fires it: the metric has no pod, so the scrape
	// target's (kube-state-metrics') pod rides along.
	const jobFailed = {
		alertname: 'KubeJobFailed',
		namespace: 'db286l',
		job_name: 'migrate-1',
		job: 'kube-state-metrics',
		instance: '10.42.0.98:8080',
		pod: 'prometheus-stack-kube-state-metrics-759cf5888-4vng5',
		service: 'prometheus-stack-kube-state-metrics'
	};

	it("drops the exporter's own pod", () => {
		expect(subjectPod(jobFailed)).toBeUndefined();
		expect(locatingLabels(jobFailed)).toBe('namespace db286l · job_name migrate-1');
	});

	it('keeps a pod the alert is about', () => {
		const labels = {
			pod: 'kube-scheduler-node-1',
			namespace: 'kube-system',
			instance: '10.0.0.1:10259',
			service: 'prometheus-stack-kube-prom-kube-scheduler',
			job: 'kube-scheduler'
		};
		expect(subjectPod(labels)).toBe('kube-scheduler-node-1');
		expect(locatingLabels(labels)).toBe('namespace kube-system · pod kube-scheduler-node-1');
	});

	it('falls back to the instance when nothing names a node or pod', () => {
		expect(locatingLabels({ instance: '10.0.0.1:9100', job: 'node-exporter' })).toBe(
			'instance 10.0.0.1:9100'
		);
	});
});

describe('formatDuration', () => {
	it('rounds down to the largest whole unit', () => {
		expect(formatDuration(-5)).toBe(formatDuration(0));
		expect(formatDuration(59)).toContain('59');
		expect(formatDuration(3 * 60 + 59)).toContain('3');
		expect(formatDuration(5 * 3600)).toContain('5');
		expect(formatDuration(2 * 86400 + 10)).toContain('2');
	});
});
