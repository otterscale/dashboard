/**
 * Workspace colours (SPEC 2). A workspace keeps its colour on every node and in both modes, so
 * colours follow the sorted workspace names, not the ranking. Four categorical colours exist; the
 * fifth workspace onwards shares one "Other workspaces" group rather than a recycled or invented
 * colour. Namespaces that belong to no workspace are "System namespaces".
 */
export const WORKSPACE_COLORS = [
	'var(--chart-6)',
	'var(--chart-7)',
	'var(--chart-8)',
	'var(--chart-9)'
];
export const SYSTEM_COLOR = 'var(--chart-4)';
export const OTHER_COLOR = 'var(--chart-5)';

export const SYSTEM_GROUP = '__system__';
export const OTHER_GROUP = '__other__';

export type Group = {
	/** A workspace name, or SYSTEM_GROUP / OTHER_GROUP. */
	id: string;
	color: string;
};

export class WorkspacePalette {
	readonly #colors = new Map<string, string>();

	/** `namespaceToWorkspace` maps a namespace to the workspace that owns it. */
	constructor(private readonly namespaceToWorkspace: Record<string, string>) {
		const names = [...new Set(Object.values(namespaceToWorkspace))].sort((a, b) =>
			a.localeCompare(b)
		);
		names.forEach((name, i) => {
			if (i < WORKSPACE_COLORS.length) this.#colors.set(name, WORKSPACE_COLORS[i]);
		});
	}

	/** The workspace that owns `namespace`, or undefined for a system namespace. */
	workspaceOf(namespace: string): string | undefined {
		return this.namespaceToWorkspace[namespace];
	}

	/** The group a namespace's pods are drawn in. */
	groupOf(namespace: string): Group {
		const ws = this.workspaceOf(namespace);
		if (!ws) return { id: SYSTEM_GROUP, color: SYSTEM_COLOR };
		const color = this.#colors.get(ws);
		return color ? { id: ws, color } : { id: OTHER_GROUP, color: OTHER_COLOR };
	}
}
