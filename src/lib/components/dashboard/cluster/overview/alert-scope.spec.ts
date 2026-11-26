import { describe, expect, it } from 'vitest';

import { clusterAlerts, isClusterLevel } from './alert-scope';
import { foldScrapeNoise } from './scrape-noise';
import type { FiringAlert } from './signals.svelte';

const alert = (
	name: string,
	severity: string,
	labels: Record<string, string> = {}
): FiringAlert => ({
	name,
	severity,
	labels: { alertname: name, ...labels }
});

describe('clusterAlerts', () => {
	it('leaves nothing of what phison-hci fired on 2026-11-24', () => {
		// Seven scrape failures of running control-plane components and one tenant job.
		const firing = [
			alert('TargetDown', 'warning', { job: 'kube-etcd', namespace: 'kube-system' }),
			alert('TargetDown', 'warning', { job: 'kube-scheduler', namespace: 'kube-system' }),
			alert('KubeProxyDown', 'critical', { job: 'kube-proxy' }),
			alert('etcdInsufficientMembers', 'critical', { job: 'kube-etcd' }),
			alert('KubeJobFailed', 'warning', { namespace: 'db286l', job_name: 'migrate-1' })
		];
		const pods = { 'etcd-m1': true, 'kube-scheduler-m1': true };
		expect(clusterAlerts(foldScrapeNoise(firing, pods))).toEqual([]);
	});

	it('keeps a control-plane alert when its pods are not Ready', () => {
		const firing = [alert('etcdInsufficientMembers', 'critical', { job: 'kube-etcd' })];
		const kept = clusterAlerts(foldScrapeNoise(firing, { 'etcd-m1': false }));
		expect(kept.map((a) => a.name)).toEqual(['etcdInsufficientMembers']);
	});

	it('drops info and severity-less alerts', () => {
		expect(
			clusterAlerts([alert('NodeClockNotSynchronising', 'info'), alert('Custom', '')])
		).toEqual([]);
	});
});

describe('isClusterLevel', () => {
	it('keeps node, control-plane, capacity, storage and unknown alerts', () => {
		for (const name of [
			'KubeNodeNotReady',
			'KubeletDown',
			'NodeFilesystemAlmostOutOfSpace',
			'KubeAPIDown',
			'KubeMemoryOvercommit',
			'KubePersistentVolumeErrors',
			'CephHealthError',
			'SomeoneElsesRule'
		]) {
			expect(isClusterLevel(alert(name, 'warning')), name).toBe(true);
		}
	});

	it('drops workload alerts wherever they run, platform namespaces included', () => {
		for (const [name, namespace] of [
			['KubePodCrashLooping', 'rook-ceph'],
			['KubeDeploymentReplicasMismatch', 'otterscale-system'],
			['KubeJobFailed', 'db286l'],
			['KubeQuotaExceeded', 'db286l'],
			['KubePersistentVolumeFillingUp', 'monitoring'],
			['CPUThrottlingHigh', 'kube-system']
		]) {
			expect(isClusterLevel(alert(name, 'warning', { namespace })), name).toBe(false);
		}
	});

	it('keeps TargetDown for the monitoring stack only', () => {
		expect(isClusterLevel(alert('TargetDown', 'warning', { namespace: 'monitoring' }))).toBe(true);
		expect(isClusterLevel(alert('TargetDown', 'warning', { namespace: 'kube-system' }))).toBe(true);
		expect(isClusterLevel(alert('TargetDown', 'warning', { namespace: 'db286l' }))).toBe(false);
		expect(isClusterLevel(alert('TargetDown', 'warning'))).toBe(false);
	});
});
