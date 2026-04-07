import { CalendarDateTime } from '@internationalized/date';

export function nowCDT(): CalendarDateTime {
	const d = new Date();
	return new CalendarDateTime(
		d.getFullYear(),
		d.getMonth() + 1,
		d.getDate(),
		d.getHours(),
		d.getMinutes()
	);
}

export function minutesAgoCDT(min: number): CalendarDateTime {
	const d = new Date(Date.now() - min * 60 * 1000);
	return new CalendarDateTime(
		d.getFullYear(),
		d.getMonth() + 1,
		d.getDate(),
		d.getHours(),
		d.getMinutes()
	);
}
