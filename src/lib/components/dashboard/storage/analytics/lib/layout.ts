// Now mode's grid (SPEC 4): as many columns as number cards, and the cards below on the same
// columns: the info card takes two, a table the rest, so the info card ends where the second
// number card does. With no table the info card takes the row. Narrow, two columns, and the
// cards below each take a row.

export const KPI_GRID: Record<4 | 5, string> = {
	4: 'grid grid-cols-2 gap-2 @md:gap-3 @4xl:grid-cols-4',
	5: 'grid grid-cols-2 gap-2 @md:gap-3 @4xl:grid-cols-5'
};

export const INFO_ALONE: Record<4 | 5, string> = {
	4: 'col-span-2 @4xl:col-span-4',
	5: 'col-span-2 @4xl:col-span-5'
};

export const INFO_BESIDE_TABLE = 'col-span-2';

export const TABLE_SPAN: Record<4 | 5, string> = {
	4: 'col-span-2',
	5: 'col-span-2 @4xl:col-span-3'
};
