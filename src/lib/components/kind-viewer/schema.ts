import type { ErrorObject, ValidateFunction } from 'ajv';

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return a copy of `value` with every object field whose value is `null` removed.
 * Array elements are recursed into but never removed, so error paths reported
 * against the pruned copy still resolve in the original document.
 *
 * This mirrors how the Kubernetes API server treats `null`: a `null` in a
 * non-nullable field means "unset" and is pruned before validation
 * (`PruneNonNullableNullsWithoutDefaults`). Kubernetes itself serializes unset
 * fields this way — e.g. `status.conditions[].lastProbeTime` and
 * `metadata.creationTimestamp` are zero-valued `metav1.Time` that marshal to
 * `null` — while the published OpenAPI schema declares them as plain `string`.
 * Validating the raw object would therefore reject an unmodified resource.
 */
export function pruneNullFields<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(pruneNullFields) as T;
	}
	if (!isObject(value)) return value;

	const pruned: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(value)) {
		if (field === null) continue;
		pruned[key] = pruneNullFields(field);
	}
	return pruned as T;
}

/**
 * Wrap an Ajv validate function so that `null` fields are pruned from the data
 * before validation (see {@link pruneNullFields}). The wrapper exposes the same
 * `errors` contract as the original validate function.
 */
export function withNullPruning<T>(validate: ValidateFunction<T>): ValidateFunction<T> {
	const wrapped = function (this: unknown, data: unknown) {
		const valid = validate.call(this, pruneNullFields(data));
		wrapped.errors = validate.errors;
		return valid;
	} as ValidateFunction<T>;

	wrapped.schema = validate.schema;
	wrapped.schemaEnv = validate.schemaEnv;
	return wrapped;
}

const MAX_LISTED_ERRORS = 5;

/**
 * Render Ajv errors as one `path: message` line each for display to the user.
 */
export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
	if (!errors || errors.length === 0) return '';

	const lines = errors.slice(0, MAX_LISTED_ERRORS).map((error) => {
		const path = error.instancePath || '/';
		if (error.keyword === 'required') {
			return `${path}: missing required property '${error.params.missingProperty}'`;
		}
		return `${path}: ${error.message}`;
	});
	if (errors.length > MAX_LISTED_ERRORS) {
		lines.push(`… and ${errors.length - MAX_LISTED_ERRORS} more`);
	}
	return lines.join('\n');
}
