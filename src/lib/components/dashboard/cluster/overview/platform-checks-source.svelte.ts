import { type Client, Code, ConnectError } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';
import type { PrometheusDriver } from 'prometheus-query';

import { m } from '$lib/messages';
import { fetchCombinedInstantOrNull } from '$lib/prometheus';

import { formatDuration } from './format';

// Platform checks (SPEC 3.7): facts about the platform an admin should not have to go looking
// for. SPEC planned a backend summary API; until it exists they are read here, the way the entry
// points are: three from the Kubernetes API (cluster admins only) and one from Prometheus.
//
//   Modules         Flux HelmReleases in otterscale-system, by their Ready condition
//   Backup          Velero Schedules and Backups in velero
//   Certificates    cert-manager Certificates, by the earliest notAfter
//   Notifications   Alertmanager's own count of configured integrations
//
// The checks are shaped like SPEC's `checks` array, so the source can be swapped for the backend
// API without touching the card. License belongs to the enterprise edition and is added there.

export type CheckId = 'modules' | 'backup' | 'certificates' | 'notifications';

/** `unknown`: the check could not be read. `none`: nothing to judge yet, neither good nor bad. */
export type CheckState = 'ok' | 'warning' | 'critical' | 'none' | 'unknown';

export type PlatformCheck = { id: CheckId; state: CheckState; value: string; detail?: string };

type KubeObject = Record<string, unknown>;

/** A list that came back, a resource type the cluster does not have, or a read that failed. */
export type Listed = KubeObject[] | 'missing' | 'failed';

function field(object: unknown, ...path: string[]): unknown {
	let current = object;
	for (const key of path) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function text(object: unknown, ...path: string[]): string | undefined {
	const value = field(object, ...path);
	return typeof value === 'string' && value ? value : undefined;
}

/** Status of a condition type: 'True', 'False', 'Unknown', or undefined when absent. */
function condition(object: unknown, type: string): string | undefined {
	const conditions = field(object, 'status', 'conditions');
	if (!Array.isArray(conditions)) return undefined;
	return text(
		conditions.find((c) => text(c, 'type') === type),
		'status'
	);
}

function time(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : undefined;
}

const unread = (id: CheckId, listed: 'missing' | 'failed'): PlatformCheck => ({
	id,
	state: 'unknown',
	value: '—',
	detail: listed === 'missing' ? m.check_not_installed() : m.check_cannot_read()
});

const name = (object: unknown) => text(object, 'metadata', 'name') ?? '?';

/** All HelmReleases Ready, or which are not. */
export function modulesCheck(releases: Listed): PlatformCheck {
	if (!Array.isArray(releases)) return unread('modules', releases);
	if (releases.length === 0) return { id: 'modules', state: 'none', value: m.check_none() };
	const notReady = releases.filter((release) => condition(release, 'Ready') !== 'True');
	const value = m.check_modules_ready({
		ready: String(releases.length - notReady.length),
		total: String(releases.length)
	});
	if (notReady.length === 0)
		return { id: 'modules', state: 'ok', value, detail: m.check_modules_detail() };
	const more = notReady.length > 1 ? ` +${notReady.length - 1}` : '';
	return {
		id: 'modules',
		state: 'warning',
		value,
		detail: `${m.check_not_ready({ name: name(notReady[0]) })}${more}`
	};
}

/**
 * How often a cron schedule runs, in ms, and how to say it. Only the shapes Velero is usually
 * given are recognised; anything else is quoted as written and not judged for staleness.
 */
export function describeSchedule(cron: string): { period?: number; label: string } {
	const spec = cron.trim();
	const every = /^@every\s+(?:(\d+)h)?(?:(\d+)m)?$/.exec(spec);
	if (every && (every[1] || every[2])) {
		const period = (Number(every[1] ?? 0) * 60 + Number(every[2] ?? 0)) * 60_000;
		return { period, label: m.check_schedule_every({ interval: spec.slice(7) }) };
	}
	const named: Record<string, string> = {
		'@hourly': '0 * * * *',
		'@daily': '0 0 * * *',
		'@midnight': '0 0 * * *',
		'@weekly': '0 0 * * 0'
	};
	const fields = (named[spec] ?? spec).split(/\s+/);
	if (fields.length === 5) {
		const [minute, hour, dom, month, dow] = fields;
		const at = /^\d+$/.test(minute) && /^\d+$/.test(hour);
		const clock = at ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : '';
		if (/^\d+$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
			return { period: 3_600_000, label: m.check_schedule_hourly() };
		}
		if (at && dom === '*' && month === '*' && dow === '*') {
			return { period: 86_400_000, label: m.check_schedule_daily({ time: clock }) };
		}
		if (at && dom === '*' && month === '*' && /^\d$/.test(dow)) {
			return { period: 7 * 86_400_000, label: m.check_schedule_weekly({ time: clock }) };
		}
	}
	return { label: spec };
}

const FINISHED = new Set(['Completed', 'PartiallyFailed', 'Failed', 'FailedValidation']);

/** The latest finished Velero backup, judged against how often the schedule runs. */
export function backupCheck(schedules: Listed, backups: Listed, now: number): PlatformCheck {
	if (schedules === 'missing' || backups === 'missing') {
		return {
			id: 'backup',
			state: 'warning',
			value: m.check_not_installed(),
			detail: m.check_backup_none()
		};
	}
	if (!Array.isArray(schedules)) return unread('backup', schedules);
	if (!Array.isArray(backups)) return unread('backup', backups);
	if (schedules.length === 0 && backups.length === 0) {
		return {
			id: 'backup',
			state: 'warning',
			value: m.check_not_set_up(),
			detail: m.check_backup_none()
		};
	}

	const described = schedules.map((s) => describeSchedule(text(s, 'spec', 'schedule') ?? ''));
	const detail =
		schedules.length === 0
			? m.check_backup_no_schedule()
			: schedules.length === 1
				? described[0].label
				: m.check_backup_schedules({ count: String(schedules.length) });
	// Stale after two runs of the most frequent schedule were missed (SPEC 3.7).
	const periods = described.map((d) => d.period).filter((p): p is number => p !== undefined);
	const period = periods.length ? Math.min(...periods) : undefined;

	const finishedAt = (b: unknown) =>
		time(text(b, 'status', 'completionTimestamp')) ??
		time(text(b, 'status', 'startTimestamp')) ??
		time(text(b, 'metadata', 'creationTimestamp')) ??
		0;
	const finished = backups
		.filter((b) => FINISHED.has(text(b, 'status', 'phase') ?? ''))
		.sort((a, b) => finishedAt(b) - finishedAt(a));
	const last = finished[0];
	const lastSuccess = finished.find((b) => text(b, 'status', 'phase') === 'Completed');
	const ago = (b: unknown) => formatDuration((now - finishedAt(b)) / 1000);

	if (last && text(last, 'status', 'phase') !== 'Completed') {
		return {
			id: 'backup',
			state: 'warning',
			value: m.check_backup_failed({ ago: ago(last) }),
			detail
		};
	}
	if (lastSuccess) {
		const stale = period !== undefined && now - finishedAt(lastSuccess) > 2 * period;
		return {
			id: 'backup',
			state: stale ? 'warning' : 'ok',
			value: stale
				? m.check_backup_last_success({ ago: ago(lastSuccess) })
				: m.check_backup_succeeded({ ago: ago(lastSuccess) }),
			detail
		};
	}
	return { id: 'backup', state: 'none', value: m.check_backup_waiting(), detail };
}

const DAY = 86_400_000;

/**
 * The certificate that expires first. cert-manager renews well before then, so one close to
 * expiry means renewal is failing. Certificates it does not manage (a customer's own, kept in a
 * Secret) are not seen here.
 */
export function certificatesCheck(certificates: Listed, now: number): PlatformCheck {
	if (!Array.isArray(certificates)) return unread('certificates', certificates);
	if (certificates.length === 0) {
		return {
			id: 'certificates',
			state: 'none',
			value: m.check_none(),
			detail: m.check_certificates_none()
		};
	}
	const notReady = certificates.filter((c) => condition(c, 'Ready') === 'False');
	const dated = certificates
		.map((c) => ({ c, at: time(text(c, 'status', 'notAfter')) }))
		.filter((d): d is { c: KubeObject; at: number } => d.at !== undefined)
		.sort((a, b) => a.at - b.at);
	const next = dated[0];
	if (!next) {
		return {
			id: 'certificates',
			state: notReady.length ? 'warning' : 'none',
			value: notReady.length
				? m.check_certificates_not_ready({ count: String(notReady.length) })
				: '—',
			detail: notReady.length ? name(notReady[0]) : undefined
		};
	}
	const days = Math.floor((next.at - now) / DAY);
	const state: CheckState = days < 7 ? 'critical' : days < 30 || notReady.length ? 'warning' : 'ok';
	// A failing certificate is the news unless one is about to expire.
	if (notReady.length && days >= 30) {
		return {
			id: 'certificates',
			state,
			value: m.check_certificates_not_ready({ count: String(notReady.length) }),
			detail: name(notReady[0])
		};
	}
	return {
		id: 'certificates',
		state,
		value:
			days < 0 ? m.check_certificates_expired() : m.check_certificates_days({ days: String(days) }),
		detail: m.check_certificates_next({ name: name(next.c) })
	};
}

/**
 * Whether Alertmanager sends alerts anywhere. `alertmanager_integrations` counts the configured
 * receivers' integrations of every kind (email, Slack, webhook, …), whether they came from an
 * AlertmanagerConfig or the chart's values.
 */
export function notificationsCheck(
	integrations: number | undefined,
	reloaded: number | undefined
): PlatformCheck {
	if (integrations === undefined) {
		return { id: 'notifications', state: 'unknown', value: '—', detail: m.check_cannot_read() };
	}
	if (reloaded === 0) {
		return {
			id: 'notifications',
			state: 'warning',
			value: m.check_notifications_config_failed(),
			detail: m.check_notifications_config_failed_detail()
		};
	}
	if (integrations === 0) {
		return {
			id: 'notifications',
			state: 'warning',
			value: m.check_not_set_up(),
			detail: m.check_notifications_nobody()
		};
	}
	return {
		id: 'notifications',
		state: 'ok',
		value: m.check_set_up(),
		detail: m.check_notifications_channels({ count: String(integrations) })
	};
}

type ListParams = { group: string; version: string; resource: string; namespace: string };

export class PlatformChecksSource {
	/** null until read, and when the Kubernetes API refuses: the card is then not drawn. */
	checks = $state<PlatformCheck[] | null>(null);
	loaded = $state(false);

	#client: Client<typeof ResourceService>;
	#driver: () => PrometheusDriver;
	#cluster: string;
	#timer: ReturnType<typeof setInterval> | undefined;

	constructor(
		client: Client<typeof ResourceService>,
		driver: () => PrometheusDriver,
		cluster: string
	) {
		this.#client = client;
		this.#driver = driver;
		this.#cluster = cluster;
	}

	start() {
		void this.refresh();
		this.#timer ??= setInterval(() => void this.refresh(), 60_000);
	}

	stop() {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	async #list(params: ListParams): Promise<Listed> {
		try {
			const response = await this.#client.list({ cluster: this.#cluster, ...params });
			return response.items.map((item) => (item.object ?? {}) as KubeObject);
		} catch (error) {
			return ConnectError.from(error).code === Code.NotFound ? 'missing' : 'failed';
		}
	}

	async refresh() {
		const [releases, schedules, backups, certificates, alertmanager] = await Promise.all([
			this.#list({
				group: 'helm.toolkit.fluxcd.io',
				version: 'v2',
				resource: 'helmreleases',
				namespace: 'otterscale-system'
			}),
			this.#list({ group: 'velero.io', version: 'v1', resource: 'schedules', namespace: 'velero' }),
			this.#list({ group: 'velero.io', version: 'v1', resource: 'backups', namespace: 'velero' }),
			this.#list({
				group: 'cert-manager.io',
				version: 'v1',
				resource: 'certificates',
				namespace: ''
			}),
			fetchCombinedInstantOrNull(this.#driver(), {
				integrations: 'sum(alertmanager_integrations)',
				reloaded: 'min(alertmanager_config_last_reload_successful)'
			})
		]);
		// Every OtterScale cluster runs Flux, so an unreadable module list means this user may not
		// read the platform's objects: SPEC hides the whole card for them.
		if (releases === 'failed') {
			this.checks = null;
			this.loaded = true;
			return;
		}
		const number = (key: string) => {
			const value = alertmanager?.[key]?.[0]?.value?.value;
			return value === undefined ? undefined : Number(value);
		};
		const now = Date.now();
		this.checks = [
			modulesCheck(releases),
			backupCheck(schedules, backups, now),
			certificatesCheck(certificates, now),
			notificationsCheck(number('integrations'), number('reloaded'))
		];
		this.loaded = true;
	}
}
