import { m } from '$lib/messages';

import type { Entry } from './model';

/** What kind of workload a row is, as the ranking's chip and the heading both write it. */
export function kindLabel(entry: Pick<Entry, 'kind' | 'resource'>): string {
	if (entry.kind === 'model') return m.model();
	if (entry.kind === 'release') return m.release();
	return entry.resource === 'statefulsets' ? m.ws_analytics_statefulset() : m.deployment();
}
