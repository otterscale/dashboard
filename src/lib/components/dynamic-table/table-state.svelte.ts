import type { SortingState } from '@tanstack/table-core';
import { SvelteURL } from 'svelte/reactivity';

import { goto } from '$app/navigation';
import { page } from '$app/state';

type TableMode = 'table' | 'grid';

/**
 * Table State Keys
 *
 * These are URL search parameter names,
 * so they are short and human-readable:
 * they end up in links people copy and paste.
 * Only `SearchParametersTableState` uses them;
 * `MemoryTableState` never touches the URL.
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
 *
 * Every field is `readonly`:
 * state is only ever changed through the `set*` methods,
 * so the knock-on effects of an action cannot be bypassed —
 * a new search resetting the page, for instance.
 *
 * `null` means "the user has not set this", not "off".
 * Defaults live with the caller:
 * a table that wants to start sorted by name reads `sorting ?? myDefault`.
 * That is why `sorting` and `hiddenColumnIds` distinguish `null` from `[]`.
 * `[]` is an explicit "no sorting / nothing hidden" that must suppress the default,
 * whereas `null` lets it apply.
 */
interface TableState {
	readonly mode: TableMode | null;
	/** Empty string already means "not searching", so no `null` is needed. */
	readonly globalFilter: string;
	readonly sorting: SortingState | null;
	readonly pageIndex: number | null;
	readonly pageSize: number | null;
	readonly hiddenColumnIds: string[] | null;

	setMode(next: TableMode | null): void;
	setGlobalFilter(next: string): void;
	setSorting(next: SortingState | null): void;
	/** Both values move together because TanStack reports them together. */
	setPagination(pageIndex: number | null, pageSize: number | null): void;
	setHiddenColumnIds(next: string[] | null): void;
}

// Instance

/**
 * A description of which fields change, not a complete state.
 *
 * A field left out is left alone;
 * a field set to `null` is cleared back to unset.
 * No field is ever passed as an explicit `undefined`,
 * which is what lets an implementation test presence with `!== undefined` —
 * and why it must not test truthiness,
 * since `null`, `''` and `0` are all meaningful values.
 */
type TableStatePatch = {
	mode?: TableMode | null;
	globalFilter?: string;
	sorting?: SortingState | null;
	pageIndex?: number | null;
	pageSize?: number | null;
	hiddenColumnIds?: string[] | null;
};

type TableStateWriteOptions = {
	/**
	 * Describes the intent of the action, not a storage detail:
	 * only deliberate actions earn a history entry.
	 * Implementations without a history concept ignore it.
	 */
	history?: 'push' | 'replace';
};

/**
 * Owns the semantics of each user action:
 * which fields a single interaction changes,
 * and whether it belongs in the history.
 * Knows nothing about where state is kept — subclasses supply only `write`.
 */
abstract class TableStateBase {
	setMode(next: TableMode | null) {
		// Switching table/grid changes neither which rows exist nor their order,
		// so nothing else is touched.
		this.write({ mode: next });
	}

	setGlobalFilter(next: string) {
		this.write(
			// A new query invalidates the current page.
			{ globalFilter: next, pageIndex: null },
			// Searching is an explicit, deliberate action, so it earns a history entry:
			// back returns to the previous query.
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

	/**
	 * Applies every field of `patch` as a single atomic write.
	 * Splitting it into one write per field is not an option
	 * for an implementation whose reads lag its writes:
	 * a second write would be computed from pre-first-write state and would clobber it.
	 * This is exactly why the `set*` methods above pass a patch
	 * rather than calling a per-field setter twice.
	 */
	protected abstract write(patch: TableStatePatch, options?: TableStateWriteOptions): void;
}

// Memory Instance

/**
 * Keeps table state in memory, scoped to the component instance.
 *
 * Use it for tables that are not the page's subject —
 * several tables shown side by side, or a table inside a panel —
 * where a sort or page position does not belong in a shareable link,
 * and where sharing the URL parameters with a sibling table would make them fight.
 */
class MemoryTableState extends TableStateBase implements TableState {
	#mode = $state<TableMode | null>(null);
	#globalFilter = $state('');
	#sorting = $state<SortingState | null>(null);
	#pageIndex = $state<number | null>(null);
	#pageSize = $state<number | null>(null);
	#hiddenColumnIds = $state<string[] | null>(null);

	// Getters without setters are how the interface's `readonly` is enforced at runtime.
	// They also return the stored reference itself, so reading twice yields the same array;
	// see the note on the URL implementation for why that matters.
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

	// No `options` parameter: memory has no history to push onto.
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

/**
 * Persists table state in the page URL,
 * so a view can be linked to and survives a reload.
 * Nothing is stored on the instance:
 * the URL is the single source of truth and every field is derived from it,
 * which makes it impossible for the two to drift apart.
 *
 * At most one table per page may own the URL.
 * The parameter names are fixed and shared,
 * so a second URL-backed table on the same page would fight this one
 * over every sort, page and search change.
 * Give the others `MemoryTableState`.
 *
 * Fields that decode into a fresh array read their raw parameter
 * through a private intermediate `$derived`.
 * `page.url` is replaced wholesale on every navigation,
 * so a single-stage derived would rebuild the array — and hand out a new reference —
 * even when paging.
 * Consumers that compare state by reference (TanStack Table does)
 * would read that as "sorting changed" and re-run their row model, or loop.
 * Splitting the derivation means the decode only re-runs
 * when the raw string genuinely differs,
 * because Svelte stops propagation when a derived recomputes to an equal value.
 * Scalar fields need no such split: `!==` already settles them.
 */
class SearchParametersTableState extends TableStateBase implements TableState {
	mode = $derived.by<TableMode | null>(() => {
		const value = page.url.searchParams.get(TABLE_STATES.VIEW);
		// Whitelist rather than cast:
		// the URL is user-editable input,
		// so anything the encoder would not have produced falls back to unset.
		return value === 'grid' || value === 'table' ? value : null;
	});

	globalFilter = $derived(page.url.searchParams.get(TABLE_STATES.QUERY) ?? '');

	// `get` already separates the two states this needs:
	// `null` when the parameter is absent,
	// `''` for an explicit `?sort=` meaning "sorted by nothing, on purpose".
	#sortParameter = $derived(page.url.searchParams.get(TABLE_STATES.SORT));

	sorting = $derived.by<SortingState | null>(() =>
		this.#sortParameter === null ? null : decodeSorting(this.#sortParameter)
	);

	pageIndex = $derived.by<number | null>(() =>
		decodePageIndex(page.url.searchParams.get(TABLE_STATES.PAGE))
	);

	pageSize = $derived.by<number | null>(() =>
		decodePageSize(page.url.searchParams.get(TABLE_STATES.SIZE))
	);

	// An explicit empty `hide=` means every column was unhidden by hand,
	// which is not the same state as never having touched the columns at all.
	#hideParameter = $derived(page.url.searchParams.get(TABLE_STATES.HIDE));

	hiddenColumnIds = $derived.by<string[] | null>(() =>
		this.#hideParameter === null ? null : decodeHiddenColumnIds(this.#hideParameter)
	);

	protected write(
		tableStatePatch: TableStatePatch,
		// Defaults to `replace` because most interactions —
		// paging, re-sorting, toggling a column —
		// should not each cost a press of the back button.
		{ history = 'replace' }: TableStateWriteOptions = {}
	) {
		// Clone: `page.url` is a read-only reactive source,
		// and mutating it would change the state without navigating.
		const url = new SvelteURL(page.url);
		// A live view of `url`, so every edit below lands in `url.href`.
		const searchParameters = url.searchParams;

		if (tableStatePatch.mode !== undefined) {
			patchSearchParameters(searchParameters, TABLE_STATES.VIEW, tableStatePatch.mode);
		}
		if (tableStatePatch.globalFilter !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.QUERY,
				// `||` not `??`:
				// an empty query is exactly the case to drop,
				// so the URL never carries a bare `?query=`.
				tableStatePatch.globalFilter || null
			);
		}
		if (tableStatePatch.sorting !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.SORT,
				// `encodeSorting([])` is `''`, which writes the `?sort=` sentinel,
				// and so round-trips back to `[]` rather than collapsing into `null`.
				tableStatePatch.sorting === null ? null : encodeSorting(tableStatePatch.sorting)
			);
		}
		if (tableStatePatch.pageIndex !== undefined) {
			patchSearchParameters(
				searchParameters,
				TABLE_STATES.PAGE,
				// The URL is 1-based for readability; internally it stays 0-based.
				// The offset lives here and in `decodePageIndex`, nowhere else.
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
				// `[].join(',')` is `''`, which writes the `?hide=` sentinel:
				// the same mechanism as sorting above.
				tableStatePatch.hiddenColumnIds === null ? null : tableStatePatch.hiddenColumnIds.join(',')
			);
		}

		// A patch can be a no-op:
		// re-selecting the current page size,
		// or toggling a column that is already hidden.
		// Navigating anyway would stack identical history entries
		// and make the back button feel broken.
		if (url.href === page.url.href) return;
		// The URL is cloned from page.url, so the base path is already applied.
		// resolve() would double it, and its type doesn't accept query strings.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, {
			replaceState: history === 'replace',
			// Without this the focus returns to <body>,
			// losing the column header a keyboard user just activated.
			keepFocus: true,
			// Without this every sort or page change jumps back to the top.
			noScroll: true,
			// Filtering is client-side; the data prop must survive the navigation.
			invalidateAll: false
		});
	}
}

// Search Parameters Helpers

/**
 * Sorting is a single comma-separated parameter rather than a repeated one,
 * so that the empty state has a representation (`?sort=`)
 * and so the raw value is one string the derivation above can compare.
 * Column ids may therefore contain ':' but must not contain ','.
 */
function decodeSorting(value: string): SortingState {
	return value.split(',').flatMap((entry) => {
		// `flatMap` doubles as the filter: `[]` drops an entry, `[x]` keeps it.
		// It is also what turns `''.split(',')` — which is `['']`, not `[]` —
		// into the empty sorting state.

		// Sort entries follow the common `field:direction` convention.
		// Column ids may themselves contain ':', so split on the last one.
		const separatorIndex = entry.lastIndexOf(':');
		if (separatorIndex === -1) return [];

		const field = entry.slice(0, separatorIndex);
		const direction = entry.slice(separatorIndex + 1);

		// Anything the encoder wouldn't have produced is dropped rather than guessed:
		// a malformed entry means a hand-edited or stale link.
		if (!field) return [];
		if (direction !== 'asc' && direction !== 'desc') return [];

		return [{ id: field, desc: direction === 'desc' }];
	});
}

/** Inverse of `decodeSorting`; `[]` encodes to `''`, the explicit-empty sentinel. */
function encodeSorting(sorting: SortingState): string {
	return sorting.map((entry) => `${entry.id}:${entry.desc ? 'desc' : 'asc'}`).join(',');
}

function decodePageIndex(value: string | null): number | null {
	if (value === null) return null;
	const pageNumber = Number(value);
	// `isFinite` rejects NaN and Infinity in one check.
	// `<= 1` also covers the first page,
	// which does not need to appear in the URL at all.
	if (!Number.isFinite(pageNumber) || pageNumber <= 1) return null;
	return Math.floor(pageNumber) - 1;
}

function decodePageSize(value: string | null): number | null {
	if (value === null) return null;
	const sizeNumber = Number(value);
	if (!Number.isFinite(sizeNumber) || sizeNumber <= 0) return null;
	return Math.floor(sizeNumber);
}

function decodeHiddenColumnIds(value: string): string[] {
	return (
		value
			.split(',')
			.map((id) => id.trim())
			// `''.split(',')` is `['']`,
			// so this filter is what produces the empty state,
			// and it also tolerates a hand-typed `a,,b`.
			.filter(Boolean)
	);
}

/** `null` deletes the parameter; `''` sets it to an empty value, which differs. */
function patchSearchParameters(parameters: URLSearchParams, key: string, value: string | null) {
	if (value === null) {
		parameters.delete(key);
	} else {
		parameters.set(key, value);
	}
}

// Only the two implementations and the types callers need.
// `TableStateBase`, `TableStatePatch` and the helpers stay private,
// so the patch shape or a third storage backend can change
// without touching any consumer.
export { MemoryTableState, SearchParametersTableState };
export type { TableMode, TableState };
