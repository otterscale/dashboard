import type { JsonValue } from '@bufbuild/protobuf';

type StatusTone = 'healthy' | 'progressing' | 'degraded' | 'failed' | 'stopped' | 'unknown';

type StatusReading = {
	tone: StatusTone;
	// Set when the value was a `ready/total` count, so simple mode can phrase it.
	ratio?: { ready: number; total: number };
};

// Kubernetes reports status as free text that differs per kind (`Running`, `Bound`, `True`,
// `CrashLoopBackOff`, …). Matching on lowercase keywords keeps every kind's vocabulary in one
// place instead of in each column definition.
const HEALTHY = [
	'running',
	'ready',
	'true',
	'active',
	'bound',
	'available',
	'succeeded',
	'completed',
	'healthy',
	'deployed',
	'established',
	'synced'
];
const PROGRESSING = [
	'pending',
	'progressing',
	'creating',
	'containercreating',
	'podinitializing',
	'init:',
	'starting',
	'provisioning',
	'importing',
	'reconciling',
	'scheduling',
	'terminating',
	'migrating',
	'updating'
];
const FAILED = [
	'failed',
	'error',
	'crashloopbackoff',
	'imagepullbackoff',
	'errimagepull',
	'oomkilled',
	'evicted',
	'lost',
	'false',
	'notready',
	'unhealthy',
	'invalid'
];
const STOPPED = ['stopped', 'paused', 'suspended', 'halted', 'terminated'];

function matches(value: string, keywords: string[]): boolean {
	return keywords.some((keyword) => value === keyword || value.startsWith(keyword));
}

function readStatus(value: JsonValue): StatusReading {
	if (value === null || value === undefined || value === '') return { tone: 'unknown' };
	if (typeof value === 'boolean') return { tone: value ? 'healthy' : 'failed' };

	const text = String(value).trim();

	const ratio = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
	if (ratio) {
		const ready = Number(ratio[1]);
		const total = Number(ratio[2]);
		// Scaled to zero is a choice, not a fault.
		if (total === 0) return { tone: 'stopped', ratio: { ready, total } };
		if (ready >= total) return { tone: 'healthy', ratio: { ready, total } };
		if (ready === 0) return { tone: 'failed', ratio: { ready, total } };
		return { tone: 'degraded', ratio: { ready, total } };
	}

	const normalized = text.toLowerCase().replace(/\s+/g, '');
	// Failure words are checked first: `NotReady` must not be read as `Ready`.
	if (matches(normalized, FAILED)) return { tone: 'failed' };
	if (matches(normalized, STOPPED)) return { tone: 'stopped' };
	if (matches(normalized, PROGRESSING)) return { tone: 'progressing' };
	if (matches(normalized, HEALTHY)) return { tone: 'healthy' };
	return { tone: 'unknown' };
}

// Most urgent first: the order groups appear in, and the order `worstStatus` ranks by.
const STATUS_TONES: readonly StatusTone[] = [
	'failed',
	'degraded',
	'progressing',
	'unknown',
	'stopped',
	'healthy'
];

/**
 * The reading that should speak for a row with several status columns (a pod's
 * `Ready` and `Status`, say): the most urgent one. `unknown` only wins when nothing
 * else is known, so an unrecognised word never hides a clear `Healthy` or `Failed`.
 * Ties keep the earlier entry, so callers list columns in order of preference.
 */
function worstStatus<T extends { tone: StatusTone }>(readings: T[]): T | undefined {
	const rank = (tone: StatusTone) =>
		tone === 'unknown' ? STATUS_TONES.length : STATUS_TONES.indexOf(tone);
	return readings.reduce<T | undefined>(
		(worst, reading) => (!worst || rank(reading.tone) < rank(worst.tone) ? reading : worst),
		undefined
	);
}

export { readStatus, STATUS_TONES, type StatusReading, type StatusTone, worstStatus };
