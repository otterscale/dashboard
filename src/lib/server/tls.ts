import { env } from '$env/dynamic/private';

// Internal services the server talks to (Keycloak, the API, ...) are often served
// with a certificate signed by a private CA that Node does not trust by default,
// which makes every server-side `fetch` to them fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
//
// Preferred fix is to trust the CA: set NODE_EXTRA_CA_CERTS=/path/to/ca.pem (a real
// process env var, read by Node at startup — it cannot be set from here).
//
// Where that is impractical and the server only ever calls trusted internal
// endpoints, set ALLOW_INSECURE_TLS=true to skip certificate verification for all
// outbound HTTPS. Do NOT enable it anywhere the server also makes calls over the
// public internet.
if (env.ALLOW_INSECURE_TLS === 'true' && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
	console.warn(
		'[tls] ALLOW_INSECURE_TLS=true — TLS certificate verification is disabled for all outbound HTTPS'
	);
}
