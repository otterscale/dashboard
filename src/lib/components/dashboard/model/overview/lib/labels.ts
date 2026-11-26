import { m } from '$lib/messages';

import type { ModelState } from './models';

/** A model's state in words; Overview's table and Analytics' heading say the same thing. */
export const STATE_LABEL: Record<ModelState, () => string> = {
	starting: m.model_overview_state_starting,
	queueing: m.model_overview_state_queueing,
	idle: m.model_overview_state_idle,
	serving: m.model_overview_state_serving
};
