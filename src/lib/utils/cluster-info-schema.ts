/**
 * Structural validation rules for the import-cluster wizard's "cluster info"
 * fields (externalAddress / nodePortRange / inferenceURL), shared between the
 * client form (import-cluster-external.svelte) and the server route
 * (bff/cluster-import/+server.ts) so the two can't drift apart. They also mirror
 * the otterscale-agent chart's own `templates/validate.yaml`: externalAddress is
 * a bare host (the chart rejects a scheme), inferenceURL is an absolute
 * http(s):// URL (the chart requires one).
 *
 * Deliberately free of `title`/`errorMessage`: those are i18n'd display
 * concerns the client layers on top per field. This file only owns the rules
 * that must stay identical on both sides.
 *
 * nodePortRange is a `{ min, max }` object (rather than one "min-max" string)
 * specifically so "min < max" is expressible as a JSON Schema rule via ajv's
 * `$data` cross-field reference, instead of a hand-written check. The
 * otterscale-agent chart still wants a single "min-max" string — that join
 * happens once, in lib/server/agent-install.ts#buildValues, right before the
 * value enters the chart's own contract.
 */

/**
 * Usable TCP port range. Port 0 is reserved (means "any" at the socket layer),
 * so a NodePort range can't start there. The chart doesn't constrain this
 * further — Kubernetes' own default service-node-port-range is 30000-32767, but
 * a cluster can be configured wider, so this only rejects impossible values.
 */
export const NODE_PORT_MIN = 1;
export const NODE_PORT_MAX = 65535;

// inferenceURL is deliberately absent: it's optional. Its format (an absolute
// http(s):// URL) is still checked below whenever a value is present.
export const CLUSTER_INFO_REQUIRED_FIELDS = ['externalAddress', 'nodePortRange'] as const;

// The two fields required *within* nodePortRange (the object itself is required
// by CLUSTER_INFO_REQUIRED_FIELDS above).
export const NODE_PORT_RANGE_REQUIRED_FIELDS = ['min', 'max'] as const;

/**
 * Validates against `{ externalAddress, nodePortRange: { min, max }, inferenceURL }`.
 * Requires an ajv instance compiled with `$data: true` (nodePortRange.min/max
 * cross-reference each other to enforce min < max).
 */
export const clusterInfoFieldsSchema = {
	type: 'object',
	required: CLUSTER_INFO_REQUIRED_FIELDS,
	properties: {
		externalAddress: {
			type: 'string',
			pattern: '^(?!.*://).+$'
		},
		nodePortRange: {
			type: 'object',
			required: NODE_PORT_RANGE_REQUIRED_FIELDS,
			properties: {
				// min < max is enforced from both sides ($data cross-references the
				// sibling field, so an ajv instance compiled with `$data: true` is
				// required): a bad order flags *both* inputs, not just one. An empty
				// sibling makes the $data pointer resolve to undefined, which ajv skips
				// — the `required` rule on this object is what catches a missing value.
				min: {
					type: 'integer',
					minimum: NODE_PORT_MIN,
					maximum: NODE_PORT_MAX,
					exclusiveMaximum: { $data: '1/max' }
				},
				max: {
					type: 'integer',
					minimum: NODE_PORT_MIN,
					maximum: NODE_PORT_MAX,
					exclusiveMinimum: { $data: '1/min' }
				}
			}
		},
		// Optional (not in CLUSTER_INFO_REQUIRED_FIELDS): an empty string passes;
		// a non-empty value must be an absolute http(s):// URL, matching the
		// otterscale-agent chart's `hasPrefix "http://"/"https://"` check.
		inferenceURL: {
			type: 'string',
			pattern: '^(https?://.+)?$'
		}
	}
} as const;
