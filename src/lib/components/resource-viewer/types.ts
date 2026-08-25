/**
 * A resource worth linking to from another resource's page.
 *
 * `kind` and `namespaced` are carried rather than looked up because the link is
 * built entirely from them — the target page needs the full identity in its
 * search parameters, and a wrong `namespaced` sends the viewer to a page that
 * quietly finds nothing.
 */
type RelatedResource = {
	group: string;
	version: string;
	kind: string;
	resource: string;
	namespaced: boolean;
	name: string;
	/**
	 * Where this resource lives, when that is not the namespace the section was
	 * given. A Workspace, for instance, links to children in the namespace it
	 * created rather than its own.
	 */
	namespace?: string;
};

export type { RelatedResource };
