import { describe, expect, it } from 'vitest';

import {
	MAX_NOTIFICATIONS,
	type Notification,
	reviveNotifications
} from '$lib/stores/notifications.svelte';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A notification as it comes back out of localStorage: dates as ISO strings. */
function stored(overrides: Partial<Record<keyof Notification, unknown>> = {}) {
	const now = new Date().toISOString();
	return {
		id: 'toast-1',
		from: 'OtterScale',
		level: 'error',
		title: 'Failed to edit Pod nginx',
		content: 'timeout',
		read: true,
		created: now,
		updated: now,
		...overrides
	};
}

describe('reviveNotifications', () => {
	it('revives the JSON form, turning dates back into Date objects', () => {
		const [revived] = reviveNotifications([stored()]);

		expect(revived).toMatchObject({ level: 'error', title: 'Failed to edit Pod nginx' });
		expect(revived.created).toBeInstanceOf(Date);
		expect(revived.updated).toBeInstanceOf(Date);
	});

	it('prunes notifications older than a week', () => {
		const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
		const fresh = reviveNotifications([
			stored({ id: 'old', updated: stale }),
			stored({ id: 'recent' })
		]);

		expect(fresh.map((n) => n.id)).toEqual(['recent']);
	});

	it('drops malformed entries instead of crashing on a corrupt store', () => {
		expect(reviveNotifications('not-an-array')).toEqual([]);
		expect(
			reviveNotifications([
				null,
				42,
				stored({ id: undefined }),
				stored({ title: undefined }),
				stored({ created: 'yesterday-ish' }),
				stored({ id: 'ok' })
			]).map((n) => n.id)
		).toEqual(['ok']);
	});

	it('coerces unknown levels and missing fields to safe defaults', () => {
		const [revived] = reviveNotifications([
			stored({ level: 'fatal', from: undefined, content: undefined, read: 'yes', count: -2 })
		]);

		expect(revived).toMatchObject({ level: 'info', from: '', content: '', read: false, count: 1 });
	});

	it('re-applies the cap', () => {
		const many = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, i) => stored({ id: `n-${i}` }));

		expect(reviveNotifications(many)).toHaveLength(MAX_NOTIFICATIONS);
	});
});
