import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

import ActionsList from './actions-list.svelte';
import CellsRowPicker from './cells-row-picker.svelte';
import Empty from './empty.svelte';
import Column from './filter-column.svelte';
import StringFuzzy from './filter-string-fuzzy.svelte';
import StringMatch from './filter-string-match.svelte';
import HeadersRowPicker from './headers-row-picker.svelte';
import Pagination from './pagination.svelte';
import Sorter from './sorter.svelte';

export { Empty, Pagination, Sorter };

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
