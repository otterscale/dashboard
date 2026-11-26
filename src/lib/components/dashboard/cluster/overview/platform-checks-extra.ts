import type { ListParams } from './kube';
import type { Listed, PlatformCheck } from './platform-checks-source.svelte';

/** Lists objects for a check. A refusal comes back as 'failed': the check says it cannot read. */
export type ListForCheck = (params: ListParams) => Promise<Listed>;

// Edition seam — platform checks drawn after the four every cluster has. The enterprise edition
// overlays this file (ee/src) to add License; the community edition has none.
export async function getAdditionalChecks(list: ListForCheck): Promise<PlatformCheck[]> {
	void list;
	return [];
}
