import type { InstantVector, PrometheusDriver } from 'prometheus-query';

import { fetchCombinedInstantOrNull } from '$lib/prometheus';

/**
 * `fetchCombinedInstant`, except that a failed request throws instead of coming back as
 * empty lists. Same queries, same single request: the only difference is that the widget
 * can tell "Prometheus could not be asked" from "Prometheus has nothing", and show an error
 * with a retry rather than an empty state.
 */
export async function fetchCombinedOrThrow(
	client: PrometheusDriver,
	queries: Record<string, string>
): Promise<Record<string, InstantVector[]>> {
	const result = await fetchCombinedInstantOrNull(client, queries);
	if (result === null) throw new Error('combined instant query failed');
	return result;
}
