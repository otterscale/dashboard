// Community build is never license-restricted. The EE overlay
// (ee/src/lib/server/mode.ts) replaces this with a license-driven check.
export async function getIsRestricted(
	_fetch: typeof globalThis.fetch,
	_cluster: string | undefined
): Promise<boolean> {
	return false;
}
