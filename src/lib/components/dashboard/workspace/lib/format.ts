import type { Tone } from '$lib/components/dashboard/kit';
import { GIB, MIB } from '$lib/components/dashboard/kit/format';

// How the Workspace overview cards write amounts and read shared-scope answers.

/** Numbers on one row share a unit, picked from the largest of them. */
export type Scale = { unit: string; divisor: number };

export function byteScale(...values: (number | null)[]): Scale {
	const max = Math.max(0, ...values.map((v) => v ?? 0));
	if (max >= 1024 * GIB) return { unit: 'TiB', divisor: 1024 * GIB };
	if (max >= GIB) return { unit: 'GiB', divisor: GIB };
	return { unit: 'MiB', divisor: MIB };
}

/** One decimal below ten, none from ten up, and a plain 0. */
export function amount(value: number, scale: Scale): string {
	const v = value / scale.divisor;
	if (v === 0) return '0';
	return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

/** A share of a quota or a volume: below 80 % healthy, 80–89 % a warning, 90 % and up critical. */
export function shareTone(percent: number): Tone {
	if (percent >= 90) return 'bad';
	if (percent >= 80) return 'warn';
	return 'ok';
}

/**
 * Per card, from a shared-scope answer. HAMi's series name the card `device_uuid`, the GPU
 * exporter's `UUID`.
 */
export function byCard(result: { result: unknown[] } | undefined): Map<string, number> {
	const out = new Map<string, number>();
	for (const sample of (result?.result ?? []) as {
		metric: { labels: Record<string, string> };
		value?: { value: number };
	}[]) {
		const card = sample.metric.labels.device_uuid ?? sample.metric.labels.UUID;
		const value = Number(sample.value?.value);
		if (card && Number.isFinite(value)) out.set(card, value);
	}
	return out;
}
