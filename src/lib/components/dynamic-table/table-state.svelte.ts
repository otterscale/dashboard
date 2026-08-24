import type { SortingState } from '@tanstack/table-core';

import { goto } from '$app/navigation';
import { page } from '$app/state';

type TableMode = 'table' | 'grid';

/**
 * Table State Keys
 */
const TABLE_STATES = {
	QUERY: 'query',
	VIEW: 'view',
	SORT: 'sort',
	PAGE: 'page',
	SIZE: 'size',
	HIDE: 'hide'
} as const;

/**
 * Interface
 */
interface TableState {
	readonly mode: TableMode | null;
	readonly globalFilter: string;
	readonly sorting: SortingState | null;
	readonly pageIndex: number | null;
	readonly pageSize: number | null;
	readonly hiddenColumnIds: string[] | null;

	setMode(next: TableMode | null): void;
	setGlobalFilter(next: string): void;
	setSorting(next: SortingState | null): void;
	setPagination(pageIndex: number | null, pageSize: number | null): void;
	setHiddenColumnIds(next: string[] | null): void;
}
// Instance
type TableStatePatch = {
	mode?: TableMode | null;
	globalFilter?: string;
	sorting?: SortingState | null;
	pageIndex?: number | null;
	pageSize?: number | null;
	hiddenColumnIds?: string[] | null;
};
type TableStateWriteOptions = {
	history?: 'push' | 'replace';
};
// Instance only implement state getter and write method.
abstract class TableStateBase {
	setMode(next: TableMode | null) {
		this.write({ mode: next });
	}

	setGlobalFilter(next: string) {
		this.write(
			// A new query invalidates the current page.
			{ globalFilter: next, pageIndex: null },
			// Searching is an explicit, deliberate action, so it earns a history
			// entry: back returns to the previous query.
			{ history: 'push' }
		);
	}

	setSorting(next: SortingState | null) {
		// Re-sorting invalidates the current page.
		this.write({ sorting: next, pageIndex: null });
	}

	setPagination(pageIndex: number | null, pageSize: number | null) {
		this.write({ pageIndex, pageSize });
	}

	setHiddenColumnIds(next: string[] | null) {
		// Hiding a column does not change which rows exist, so the page stands.
		this.write({ hiddenColumnIds: next });
	}

	protected abstract write(patch: TableStatePatch, options?: TableStateWriteOptions): void;
}
// Memory Instance
class MemoryTableState extends TableStateBase implements TableState {
	#mode = $state<TableMode | null>(null);
	#globalFilter = $state('');
	#sorting = $state<SortingState | null>(null);
	#pageIndex = $state<number | null>(null);
	#pageSize = $state<number | null>(null);
	#hiddenColumnIds = $state<string[] | null>(null);

	get mode() {
		return this.#mode;
	}
	get globalFilter() {
		return this.#globalFilter;
	}
	get sorting() {
		return this.#sorting;
	}
	get pageIndex() {
		return this.#pageIndex;
	}
	get pageSize() {
		return this.#pageSize;
	}
	get hiddenColumnIds() {
		return this.#hiddenColumnIds;
	}

	protected write(patch: TableStatePatch) {
		if (patch.mode !== undefined) this.#mode = patch.mode;
		if (patch.globalFilter !== undefined) this.#globalFilter = patch.globalFilter;
		if (patch.sorting !== undefined) this.#sorting = patch.sorting;
		if (patch.pageIndex !== undefined) this.#pageIndex = patch.pageIndex;
		if (patch.pageSize !== undefined) this.#pageSize = patch.pageSize;
		if (patch.hiddenColumnIds !== undefined) this.#hiddenColumnIds = patch.hiddenColumnIds;
	}
}
// Search Parameters Instance
class SearchParametersTableState extends TableStateBase implements TableState {
	mode = $derived.by<TableMode | null>(() => {
		const value = page.url.searchParams.get(TABLE_STATES.VIEW);
		return value === 'grid' || value === 'table' ? value : null;
	});
	globalFilter = $derived(page.url.searchParams.get(TABLE_STATES.QUERY) ?? '');
	sorting = $derived.by<SortingState | null>(() => {
		if (!page.url.searchParams.has(TABLE_STATES.SORT)) return null;
		return decodeSorting(page.url.searchParams.getAll(TABLE_STATES.SORT));
	});
	pageIndex = $derived.by<number | null>(() =>
		decodePageIndex(page.url.searchParams.get(TABLE_STATES.PAGE))
	);
	pageSize = $derived.by<number | null>(() =>
		decodePageSize(page.url.searchParams.get(TABLE_STATES.SIZE))
	);
	hiddenColumnIds = $derived.by<string[] | null>(() => {
		// An explicit empty `hide=` means every column was unhidden by hand, which
		// is not the same state as never having touched the columns at all.
		if (!page.url.searchParams.has(TABLE_STATES.HIDE)) return null;
		return decodeHiddenColumnIds(page.url.searchParams.get(TABLE_STATES.HIDE));
	});

	protected write(tableStatePatch: TableStatePatch, { history = 'replace' }: TableStateWriteOptions = {}) {
		const url = new URL(page.url);
		const searchParameters = url.searchParams;

		if (tableStatePatch.mode !== undefined) {
			patchSearchParameters(searchParameters, TABLE_STATES.VIEW, tableStatePatch.mode);
		}
		if (tableStatePatch.globalFilter !== undefined) {
			patchSearchParameters(searchParameters, TABLE_STATES.QUERY, tableStatePatch.globalFilter || null);
		}
		if (tableStatePatch.sorting !== undefined) {
			searchParameters.delete(TABLE_STATES.SORT);
			for (const entry of encodeSorting(tableStatePatch.sorting ?? [])) {
				searchParameters.append(TABLE_STATES.SORT, entry);
			}
		}
		if (tableStatePatch.pageIndex !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.PAGE,
				tableStatePatch.pageIndex === null ? null : String(tableStatePatch.pageIndex + 1)
			);
		}
		if (tableStatePatch.pageSize !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.SIZE,
				tableStatePatch.pageSize === null ? null : String(tableStatePatch.pageSize)
			);
		}
		if (tableStatePatch.hiddenColumnIds !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.HIDE,
				tableStatePatch.hiddenColumnIds === null ? null : tableStatePatch.hiddenColumnIds.join(',')
			);
		}

		// A patch can be a no-op (re-selecting the current page size, toggling a
		// column that is already hidden). Navigating anyway would stack identical
		// history entries and make the back button feel broken.
		if (url.href === page.url.href) return;
		// The URL is cloned from page.url, so the base path is already applied —
		// resolve() would double it, and its type doesn't accept query strings.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, {
			replaceState: history === 'replace',
			keepFocus: true,
			noScroll: true,
			// Filtering is client-side; the data prop must survive the navigation.
			invalidateAll: false
		});
	}
}
// Search Parameters Helpers
function decodeSorting(entries: string[]): SortingState {
	return entries.flatMap((entry) => {
		// Sort params follow the common `field:direction` convention.
		// Column ids may themselves contain ':', so split on the last one.
		const separatorIndex = entry.lastIndexOf(':');
		if (separatorIndex === -1) return [];

		const field = entry.slice(0, separatorIndex);
		const direction = entry.slice(separatorIndex + 1);

		// Anything the encoder wouldn't have produced is dropped rather than
		// guessed — a malformed entry means a hand-edited or stale link.
		if (!field) return [];
		if (direction !== 'asc' && direction !== 'desc') return [];

		return [{ id: field, desc: direction === 'desc' }];
	});
}

function encodeSorting(sorting: SortingState): string[] {
	return sorting.map((entry) => `${entry.id}:${entry.desc ? 'desc' : 'asc'}`);
}

function decodePageIndex(value: string | null): number | null {
	if (value === null) return null;
	const pageNumber = Number(value);
	if (!Number.isFinite(pageNumber) || pageNumber <= 1) return null;
	return Math.floor(pageNumber) - 1;
}

function decodePageSize(value: string | null): number | null {
	if (value === null) return null;
	const sizeNumber = Number(value);
	if (!Number.isFinite(sizeNumber) || sizeNumber <= 0) return null;
	return Math.floor(sizeNumber);
}

function decodeHiddenColumnIds(value: string | null): string[] {
	return (value ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
}

/** `null` deletes the parameter; `''` sets it to an empty value, which differs. */
function patchSearchParameters(parameters: URLSearchParams, key: string, value: string | null) {
	if (value === null) {
		parameters.delete(key);
	} else {
		parameters.set(key, value);
	}
}

export { MemoryTableState, SearchParametersTableState  };
export type { TableState, TableMode };