import type { Schema } from '@sjsf/form';
import Ajv, { type ValidateFunction } from 'ajv';

// TODO: replace with validator injection.
// One Ajv instance for the app. Validators are cached by a content hash of the schema,
// so a cached validator always matches the schema it is asked to validate against:
// an unchanged schema skips the compile, a changed one recompiles.
const ajv = new Ajv({ allErrors: true, strict: false, logger: false });

const validators = new Map<string, ValidateFunction>();

// `crypto.subtle` exists only in secure contexts (https and localhost), which is how
// the dashboard is served.
async function fingerprint(schema: Schema): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(schema));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function getValidator(schema: Schema): Promise<ValidateFunction> {
	const key = await fingerprint(schema);

	const cached = validators.get(key);
	if (cached) return cached;

	const compiled = ajv.compile(schema);
	validators.set(key, compiled);
	return compiled;
}
