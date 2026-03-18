export function getTimezones(): string[] {
	try {
		const timezones = [...new Set(['Etc/UTC', ...Intl.supportedValuesOf('timeZone')])];
		return timezones;
	} catch (error) {
		console.error('Failed to fetch timezones from Intl:', error);
		return ['Etc/UTC'];
	}
}
