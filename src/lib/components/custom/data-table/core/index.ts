import Sorter from './sorter.svelte';
import Empty from './empty.svelte';
import Pagination from './pagination.svelte';
import HeadersRowPicker from './headers-row-picker.svelte';
import CellsRowPicker from './cells-row-picker.svelte';
import StringFuzzy from './filter-string-fuzzy.svelte';
import StringMatch from './filter-string-match.svelte';
import Column from './filter-column.svelte';
import ActionsList from './actions-list.svelte';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

export { Sorter, Empty, Pagination };

export const Headers = {
	RowPicker: HeadersRowPicker
};

export const Cells = {
	RowPicker: CellsRowPicker
};

export const Filters = {
	StringFuzzy,
	StringMatch,
	Column
};

export const Actions = {
	List: ActionsList,
	Label: DropdownMenu.Label,
	Separator: DropdownMenu.Separator,
	Item: DropdownMenu.Item
};

export function getSortingFunction<T>(
	previousValue: T,
	nextValue: T,
	lessThan: (p: T, n: T) => boolean,
	equal: (p: T, n: T) => boolean
): number {
	if (equal(previousValue, nextValue)) return 0;
	return lessThan(previousValue, nextValue) ? -1 : 1;
}
