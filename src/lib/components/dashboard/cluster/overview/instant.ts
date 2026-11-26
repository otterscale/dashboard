import type { InstantVector } from 'prometheus-query';

/** The value of a query that answers with one number; undefined when it answered with nothing. */
export function firstNumber(vectors: InstantVector[] | undefined): number | undefined {
	const value = vectors?.[0]?.value?.value;
	return value === undefined ? undefined : Number(value);
}
