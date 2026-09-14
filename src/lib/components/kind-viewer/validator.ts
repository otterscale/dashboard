import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { Schema } from '@sjsf/form';
import Ajv, { type ValidateFunction } from 'ajv';

// TODO: replace with validator injection.
// One Ajv instance for the app. Validators are cached by a content hash of the schema,
// so a cached validator always matches the schema it is asked to validate against:
// an unchanged schema skips the compile, a changed one recompiles.
const ajv = new Ajv({ allErrors: true, strict: false, logger: false });

const validators = new Map<string, ValidateFunction>();

// Oslo's SHA-256 rather than `crypto.subtle`: it is synchronous and needs no secure
// context. Hashing keeps the cache from retaining a copy of every schema it has seen —
// Pod's dereferenced schema alone is ~380KB.
function fingerprint(schema: Schema): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(JSON.stringify(schema))));
}

export function getValidator(schema: Schema): ValidateFunction {
	const key = fingerprint(schema);

	const cached = validators.get(key);
	if (cached) return cached;

	const compiled = ajv.compile(schema);
	validators.set(key, compiled);
	return compiled;
}
