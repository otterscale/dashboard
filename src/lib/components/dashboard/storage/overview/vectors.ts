import type { InstantVector } from 'prometheus-query';

// Reading the named results of a combined instant query.

export type Vectors = Record<string, InstantVector[]>;

/** The first value of a named result, as a number. */
export function first(data: Vectors | null, key: string): number | undefined {
	const value = data?.[key]?.[0]?.value?.value;
	if (value === undefined || value === null) return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/** A named result as `label value → number`. */
export function byLabel(data: Vectors | null, key: string, label: string): Map<string, number> {
	const out = new Map<string, number>();
	for (const vector of data?.[key] ?? []) {
		const id = (vector.metric.labels as Record<string, string>)[label];
		const n = Number(vector.value?.value);
		if (id !== undefined && Number.isFinite(n)) out.set(id, n);
	}
	return out;
}

export function labelsOf(data: Vectors | null, key: string): Record<string, string>[] {
	return (data?.[key] ?? []).map((vector) => vector.metric.labels as Record<string, string>);
}
