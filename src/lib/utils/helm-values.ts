import { isMap, parseDocument } from 'yaml';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
	);
}

function isEqualValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	// js-yaml parses YAML timestamps into Date objects, which have no enumerable keys.
	if (a instanceof Date || b instanceof Date) {
		return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
	}
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) =>
		isEqualValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
	);
}

/**
 * Computes the minimal override set between a chart's default values and the
 * user-edited values, so HelmRelease `spec.values` stores only what differs
 * from the chart defaults (Helm fills the rest at render time).
 *
 * Objects are compared recursively; arrays and scalars are compared as whole
 * values. Explicit `null` overrides are kept — in Helm they mean "remove the
 * default". Keys the user deleted are not recorded; Helm falls back to the
 * chart default for missing keys, which matches the previous behavior.
 */
function computeValuesDelta(defaults: unknown, userValues: unknown): Record<string, unknown> {
	if (!isPlainObject(userValues)) return {};
	const defaultsObject = isPlainObject(defaults) ? defaults : {};

	const delta: Record<string, unknown> = {};
	for (const [key, userValue] of Object.entries(userValues)) {
		const defaultValue = defaultsObject[key];
		if (isPlainObject(userValue) && isPlainObject(defaultValue)) {
			const nested = computeValuesDelta(defaultValue, userValue);
			if (Object.keys(nested).length > 0) {
				delta[key] = nested;
			}
		} else if (!isEqualValue(userValue, defaultValue)) {
			delta[key] = userValue;
		}
	}
	return delta;
}

/**
 * Applies a values override set onto a chart's default values.yaml text,
 * preserving the original comments and formatting. Overrides descend into
 * existing mappings key by key; anything else (scalars, arrays, new keys)
 * replaces the node at that path.
 */
function applyDeltaToYamlText(yamlText: string, delta: Record<string, unknown>): string {
	const document = parseDocument(yamlText);

	function apply(path: string[], value: unknown) {
		if (isPlainObject(value) && isMap(document.getIn(path))) {
			for (const [key, child] of Object.entries(value)) {
				apply([...path, key], child);
			}
		} else {
			document.setIn(path, value);
		}
	}

	for (const [key, child] of Object.entries(delta)) {
		apply([key], child);
	}
	return document.toString();
}

export { applyDeltaToYamlText, computeValuesDelta };
