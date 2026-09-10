import type { Schema } from '@sjsf/form';
import Ajv, { type ValidateFunction } from 'ajv';

// TODO: replace with validator injection.
// One Ajv instance for the app. Ajv's own cache is keyed by schema object identity,
// which a freshly fetched schema never matches, so validators are cached by resource key.
const ajv = new Ajv({ allErrors: true, strict: false, logger: false });

const validators = new Map<string, ValidateFunction>();

export function validatorKey(cluster: string, group: string, version: string, kind: string) {
	return `${cluster}|${group}|${version}|${kind}`;
}

export function getValidator(key: string, schema: Schema): ValidateFunction {
	const cached = validators.get(key);
	if (cached) return cached;

	const compiled = ajv.compile(schema);
	validators.set(key, compiled);
	return compiled;
}
