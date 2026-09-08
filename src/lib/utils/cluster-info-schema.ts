/**
 * Structural validation rules for the import-cluster wizard's "cluster info"
 * fields (externalAddress / nodePortRange / inferenceURL), shared between the
 * client form (import-cluster-external.svelte) and the server route
 * (bff/cluster-import/+server.ts) so the two can't drift apart.
 *
 * Deliberately free of `title`/`errorMessage`: those are i18n'd display
 * concerns the client layers on top per field. This file only owns the rules
 * that must stay identical on both sides.
 *
 * nodePortRange is split into nodePortRangeMin/nodePortRangeMax (rather than
 * kept as one "min-max" string) specifically so "min < max" is expressible as
 * a JSON Schema rule via ajv's `$data` cross-field reference, instead of a
 * hand-written check. The otterscale-agent chart still wants a single
 * "min-max" string — that join happens once, in
 * lib/server/agent-install.ts#buildValues, right before the value enters the
 * chart's own contract.
 */

/** Full valid TCP port range; the chart itself doesn't constrain this further. */
export const NODE_PORT_MIN = 0;
export const NODE_PORT_MAX = 65535;

export const CLUSTER_INFO_REQUIRED_FIELDS = [
	'externalAddress',
	'nodePortRangeMin',
	'nodePortRangeMax'
] as const;

/**
 * Validates against `{ externalAddress, nodePortRangeMin, nodePortRangeMax, inferenceURL }`.
 * Requires an ajv instance compiled with `$data: true` (for nodePortRangeMax's
 * cross-reference to nodePortRangeMin).
 */
export const clusterInfoFieldsSchema = {
	type: 'object',
	required: CLUSTER_INFO_REQUIRED_FIELDS,
	properties: {
		externalAddress: {
			type: 'string',
			pattern: '^(?!.*://).+$'
		},
		nodePortRangeMin: {
			type: 'integer',
			minimum: NODE_PORT_MIN,
			maximum: NODE_PORT_MAX
		},
		nodePortRangeMax: {
			type: 'integer',
			minimum: NODE_PORT_MIN,
			maximum: NODE_PORT_MAX,
			exclusiveMinimum: { $data: '1/nodePortRangeMin' }
		},
		inferenceURL: {
			type: 'string',
			pattern: '^(https?://.+)?$'
		}
	}
} as const;
