import { m } from '$lib/messages';

import { fmtDay } from './format';
import {
	DELETED_KEYS,
	type Directory,
	type Row,
	splitTenant,
	UNKNOWN_OWNER,
	type View
} from './usage';

export type DisplayRow = {
	id: string;
	label: string;
	/** Key and model names are identifiers, set in monospace. */
	mono: boolean;
	chips: string[];
	sub: string;
	/** Hover text: the full identifier behind a shortened or friendly label. */
	title?: string;
	/** Breakdown tables only: e.g. "Created Nov 3". */
	aside?: string;
	row: Row;
};

export function workspaceName(dir: Directory, namespace: string): string {
	return dir.workspaces.get(namespace) ?? namespace;
}

function keyCount(n: number): string {
	return n === 1 ? m.usage_key_count_one() : m.usage_key_count({ count: String(n) });
}

function userCount(n: number): string {
	return n === 1 ? m.usage_user_count_one() : m.usage_user_count({ count: String(n) });
}

export function operationLabel(operation: string): string {
	if (operation === 'chat') return m.usage_operation_chat();
	if (operation === 'embeddings') return m.usage_operation_embeddings();
	return operation;
}

export function viewLabel(view: View): string {
	switch (view) {
		case 'user':
			return m.usage_view_users();
		case 'key':
			return m.usage_view_keys();
		case 'workspace':
			return m.usage_view_workspaces();
		case 'model':
			return m.usage_view_models();
	}
}

export function kindLabel(view: View): string {
	switch (view) {
		case 'user':
			return m.usage_kind_user();
		case 'key':
			return m.usage_kind_key();
		case 'workspace':
			return m.usage_kind_workspace();
		case 'model':
			return m.usage_kind_model();
	}
}

const join = (parts: string[]) => parts.filter(Boolean).join(' · ');

export function displayRow(row: Row, dir: Directory, locale: string): DisplayRow {
	const spaces = row.namespaces.map((ns) => workspaceName(dir, ns)).join(', ');
	switch (row.view) {
		case 'user': {
			if (row.id === DELETED_KEYS) {
				return {
					id: row.id,
					label: m.usage_deleted_keys(),
					mono: false,
					chips: [m.usage_owner_unknown()],
					sub: m.usage_deleted_keys_note(),
					row
				};
			}
			if (row.id === UNKNOWN_OWNER) {
				return {
					id: row.id,
					label: m.usage_owner_unknown(),
					mono: false,
					chips: [],
					sub: join([keyCount(row.keys.length), spaces]),
					row
				};
			}
			return {
				id: row.id,
				label: row.label,
				mono: false,
				chips: row.owner?.serviceAccount ? [m.usage_service_account()] : [],
				sub: join([keyCount(row.keys.length), spaces]),
				title: row.id,
				row
			};
		}
		case 'key': {
			const { namespace } = splitTenant(row.id);
			const owner = row.owner
				? m.usage_owner_named({ name: row.owner.name || m.usage_owner_unknown() })
				: row.deleted
					? m.usage_owner_unknown()
					: '';
			return {
				id: row.id,
				label: row.label,
				mono: true,
				chips: row.deleted ? [m.usage_deleted()] : [],
				sub: join([owner, workspaceName(dir, namespace)]),
				title: row.id,
				aside: row.created ? m.usage_created_on({ date: fmtDay(row.created, locale) }) : undefined,
				row
			};
		}
		case 'workspace':
			return {
				id: row.id,
				label: row.label,
				mono: false,
				chips: [],
				sub: join([dir.keys ? userCount(row.users.length) : '', keyCount(row.keys.length)]),
				title: row.id,
				row
			};
		case 'model':
			return {
				id: row.id,
				label: row.label,
				mono: true,
				chips: row.namespaces.map((ns) => workspaceName(dir, ns)),
				sub: row.operations.map(operationLabel).join(', '),
				title: row.id,
				row
			};
	}
}
