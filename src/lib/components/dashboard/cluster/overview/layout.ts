// Spans of the overview grid, shared by the loaded page and its page-stage placeholder so the
// two cannot drift apart. They follow the dashboard's width (a container query), not the
// viewport's: with the sidebar open the content is narrower than the window.
export const LAYOUT = {
	grid: 'grid grid-cols-12 gap-2 @md:gap-3',
	// 4 : 8 from @5xl; stacked below.
	state: 'col-span-12 @5xl:col-span-4',
	attention: 'col-span-12 @5xl:col-span-8',
	// Four across from @5xl, two by two from @2xl, stacked below.
	capacity: 'col-span-12 @2xl:col-span-6 @5xl:col-span-3',
	// 7 : 5 from @5xl, the two cards the same height.
	controlPlane: 'col-span-12 @5xl:col-span-7',
	services: 'col-span-12 @5xl:col-span-5',
	full: 'col-span-12'
};
