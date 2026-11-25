// Spans of the Storage Overview grid. They follow the dashboard's width (a container query), not
// the viewport's: with the sidebar open the content is narrower than the window.
export const LAYOUT = {
	grid: 'grid grid-cols-12 gap-2 @md:gap-3',
	// Health 1 : 2 from @5xl; stacked below.
	health: 'col-span-12 @5xl:col-span-4',
	checks: 'col-span-12 @5xl:col-span-8',
	// Four across from @5xl, two by two from @md (a 768 px window with the sidebar open), stacked
	// below.
	capacity: 'col-span-12 @md:col-span-6 @5xl:col-span-3',
	// Daemons 1 : 2 placement groups from @5xl; stacked below.
	daemons: 'col-span-12 @5xl:col-span-4',
	pgs: 'col-span-12 @5xl:col-span-8',
	// Three across from @5xl, one per row below.
	chart: 'col-span-12 @5xl:col-span-4',
	full: 'col-span-12'
};
