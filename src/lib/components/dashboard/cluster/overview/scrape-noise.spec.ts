import { describe, expect, it } from 'vitest';

import { componentRunning, foldScrapeNoise, SCRAPE_NOISE_ALERT } from './scrape-noise';
import type { FiringAlert } from './signals.svelte';

const alert = (
	name: string,
	severity: string,
	labels: Record<string, string> = {},
	activeAt?: number
): FiringAlert => ({
	name,
	severity,
	labels: { alertname: name, ...labels },
	activeAt
});

// What phison-hci fired on 2026-11-24: one master on RKE2, Cilium in place of kube-proxy.
const PHISON_HCI = [
	alert('TargetDown', 'warning', { job: 'kube-etcd' }, 100),
	alert('TargetDown', 'warning', { job: 'kube-scheduler' }, 100),
	alert('TargetDown', 'warning', { job: 'kube-controller-manager' }, 100),
	alert('KubeProxyDown', 'critical', { job: 'kube-proxy' }, 50),
	alert('KubeSchedulerInstanceUnreachable', 'warning', { job: 'kube-scheduler' }, 120),
	alert(
		'KubeControllerManagerInstanceUnreachable',
		'warning',
		{ job: 'kube-controller-manager' },
		120
	),
	alert('etcdMembersDown', 'warning', { job: 'kube-etcd' }, 120),
	alert('etcdInsufficientMembers', 'critical', { job: 'kube-etcd' }, 120),
	alert('KubeJobFailed', 'warning', { namespace: 'db286l', job_name: 'migrate-1' }, 200)
];
const PODS_UP = {
	'etcd-master-1': true,
	'kube-scheduler-master-1': true,
	'kube-controller-manager-master-1': true
};

describe('foldScrapeNoise', () => {
	it('folds the scrape failures of running components into one info alert', () => {
		const out = foldScrapeNoise(PHISON_HCI, PODS_UP);
		expect(out.map((a) => a.name)).toEqual(['KubeJobFailed', SCRAPE_NOISE_ALERT]);
		const folded = out[1];
		expect(folded.severity).toBe('info');
		expect(folded.labels).toEqual({
			count: '4',
			components: 'etcd, kube-controller-manager, kube-proxy, kube-scheduler'
		});
		expect(folded.activeAt).toBe(50);
	});

	it('keeps the alerts of a component whose pods are not Ready', () => {
		const out = foldScrapeNoise(PHISON_HCI, { ...PODS_UP, 'etcd-master-1': false });
		expect(out.filter((a) => a.labels.job === 'kube-etcd').map((a) => a.name)).toEqual([
			'TargetDown',
			'etcdMembersDown',
			'etcdInsufficientMembers'
		]);
		expect(out.at(-1)?.labels.components).toBe(
			'kube-controller-manager, kube-proxy, kube-scheduler'
		);
	});

	it('keeps everything when the control-plane pods are unknown', () => {
		const out = foldScrapeNoise(PHISON_HCI, {});
		// Only kube-proxy folds: no pods at all means it was replaced.
		expect(out.at(-1)?.labels.components).toBe('kube-proxy');
		expect(out).toHaveLength(PHISON_HCI.length - 1 + 1);
	});

	it('leaves other TargetDown alerts alone', () => {
		const other = [alert('TargetDown', 'warning', { job: 'node-exporter' })];
		expect(foldScrapeNoise(other, PODS_UP)).toEqual(other);
	});
});

describe('componentRunning', () => {
	it('needs every pod of a component Ready', () => {
		expect(componentRunning('etcd', { 'etcd-a': true, 'etcd-b': false })).toBe(false);
		expect(componentRunning('etcd', { 'etcd-a': true, 'etcd-b': true })).toBe(true);
	});

	it('counts a kube-proxy with no pods as replaced, not missing', () => {
		expect(componentRunning('kube-proxy', {})).toBe(true);
		expect(componentRunning('kube-proxy', { 'kube-proxy-a': false })).toBe(false);
	});
});
