import { describe, expect, it } from 'vitest';

import {
	backupCheck,
	certificatesCheck,
	describeSchedule,
	modulesCheck,
	notificationsCheck
} from './platform-checks-source.svelte';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const release = (name: string, ready: string) => ({
	metadata: { name },
	status: { conditions: [{ type: 'Ready', status: ready }] }
});
const backup = (phase: string, finishedAgo: number) => ({
	metadata: { name: `b-${finishedAgo}` },
	status: { phase, completionTimestamp: iso(NOW - finishedAgo) }
});
const certificate = (name: string, daysLeft: number, ready = 'True') => ({
	metadata: { name },
	status: {
		notAfter: iso(NOW + daysLeft * 24 * HOUR + HOUR),
		conditions: [{ type: 'Ready', status: ready }]
	}
});

describe('modulesCheck', () => {
	it('is ok when every HelmRelease is Ready', () => {
		const check = modulesCheck([release('a', 'True'), release('b', 'True')]);
		expect(check.state).toBe('ok');
		expect(check.value).toContain('2 / 2');
	});

	it('names the first release that is not Ready', () => {
		const check = modulesCheck([
			release('a', 'True'),
			release('velero', 'False'),
			release('c', 'Unknown')
		]);
		expect(check.state).toBe('warning');
		expect(check.value).toContain('1 / 3');
		expect(check.detail).toContain('velero');
		expect(check.detail).toContain('+1');
	});

	it('says it cannot read rather than guessing', () => {
		expect(modulesCheck('failed').state).toBe('unknown');
	});
});

describe('describeSchedule', () => {
	it('knows the usual Velero schedules', () => {
		expect(describeSchedule('0 2 * * *')).toMatchObject({ period: 24 * HOUR });
		expect(describeSchedule('0 2 * * *').label).toContain('02:00');
		expect(describeSchedule('@every 6h').period).toBe(6 * HOUR);
		expect(describeSchedule('30 * * * *').period).toBe(HOUR);
		expect(describeSchedule('0 3 * * 0').period).toBe(7 * 24 * HOUR);
	});

	it('quotes anything else and does not judge it', () => {
		expect(describeSchedule('0 2 1,15 * *')).toEqual({ label: '0 2 1,15 * *' });
	});
});

describe('backupCheck', () => {
	const daily = [{ metadata: { name: 'daily' }, spec: { schedule: '0 2 * * *' } }];

	it('is not set up on phison-hci: Velero installed, nothing scheduled', () => {
		expect(backupCheck([], [], NOW).state).toBe('warning');
	});

	it('warns when Velero is not installed', () => {
		expect(backupCheck('missing', 'missing', NOW).state).toBe('warning');
	});

	it('is ok after a recent success', () => {
		const check = backupCheck(daily, [backup('Completed', 9 * HOUR)], NOW);
		expect(check.state).toBe('ok');
		expect(check.value).toContain('9');
	});

	it('warns when the latest backup failed, even after an earlier success', () => {
		const check = backupCheck(
			daily,
			[backup('Completed', 30 * HOUR), backup('PartiallyFailed', 6 * HOUR)],
			NOW
		);
		expect(check.state).toBe('warning');
	});

	it('warns when no success came within two runs of the schedule', () => {
		expect(backupCheck(daily, [backup('Completed', 49 * HOUR)], NOW).state).toBe('warning');
		expect(backupCheck(daily, [backup('Completed', 47 * HOUR)], NOW).state).toBe('ok');
	});

	it('waits quietly for the first run of a new schedule', () => {
		expect(backupCheck(daily, [], NOW).state).toBe('none');
	});
});

describe('certificatesCheck', () => {
	it('reports the certificate that expires first', () => {
		const check = certificatesCheck(
			[certificate('later', 300), certificate('otterscale-tls', 82)],
			NOW
		);
		expect(check.state).toBe('ok');
		expect(check.value).toContain('82');
		expect(check.detail).toContain('otterscale-tls');
	});

	it('warns under 30 days and is critical under 7', () => {
		expect(certificatesCheck([certificate('a', 20)], NOW).state).toBe('warning');
		expect(certificatesCheck([certificate('a', 3)], NOW).state).toBe('critical');
	});

	it('warns about a certificate that is not Ready', () => {
		const check = certificatesCheck(
			[certificate('a', 200), certificate('broken', 300, 'False')],
			NOW
		);
		expect(check.state).toBe('warning');
		expect(check.detail).toContain('broken');
	});
});

describe('notificationsCheck', () => {
	it('is not set up when Alertmanager has no integration, as on phison-hci', () => {
		expect(notificationsCheck(0, 1).state).toBe('warning');
	});

	it('is ok with any integration configured', () => {
		expect(notificationsCheck(2, 1)).toMatchObject({ state: 'ok' });
	});

	it('warns when Alertmanager could not load its configuration', () => {
		expect(notificationsCheck(2, 0).state).toBe('warning');
	});

	it('is unknown without Alertmanager metrics', () => {
		expect(notificationsCheck(undefined, undefined).state).toBe('unknown');
	});
});
