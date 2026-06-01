// Community build is never license-restricted. The EE overlay
// (ee/src/lib/server/mode.ts) replaces this with a license-driven check.
export async function getIsRestricted(
	fetch: typeof globalThis.fetch,
	cluster: string | undefined
): Promise<boolean> {
	void fetch;
	void cluster;
	return false;
}
