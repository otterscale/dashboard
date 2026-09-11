import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeToast = { id: number; type: string; title?: unknown; description?: unknown };

const mocks = vi.hoisted(() => ({ active: [] as FakeToast[] }));

vi.mock('svelte-sonner', () => ({ toast: { getActiveToasts: () => mocks.active } }));

const { notificationCenter } = await import('$lib/stores/notifications.svelte');
const { toastRecorder } = await import('./toast-recorder');

/** Replace the live toasts and let the recorder see them, as the layout's effect would. */
function sync(...active: FakeToast[]) {
	mocks.active = active;
	toastRecorder.sync();
	return notificationCenter.items;
}

beforeEach(() => {
	notificationCenter.clearAll();
	sync();
});

describe('toastRecorder', () => {
	it('files a failure toast as an unread notification, newest first', () => {
		sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx', description: 'timeout' });
		const [notification] = sync(
			{ id: 2, type: 'warning', title: '2 deletions requested, 1 failed' },
			{ id: 1, type: 'error', title: 'Failed to edit Pod nginx', description: 'timeout' }
		);

		expect(notification).toMatchObject({
			level: 'warning',
			title: '2 deletions requested, 1 failed',
			content: '',
			read: false
		});
		expect(notificationCenter.items).toHaveLength(2);
	});

	it('ignores success and info toasts — transient confirmations are not worth keeping', () => {
		const filed = sync(
			{ id: 1, type: 'success', title: 'Deleted Pod nginx' },
			{ id: 2, type: 'info', title: 'Reconnecting...' },
			{ id: 3, type: 'default', title: 'Hello' }
		);

		expect(filed).toHaveLength(0);
	});

	it('files a toast once, however often it is seen', () => {
		const toast = { id: 1, type: 'error', title: 'Failed to edit Pod nginx' };
		sync(toast);
		sync(toast);

		expect(sync(toast)).toHaveLength(1);
	});

	it('waits for a loading toast to resolve, then files it once', () => {
		sync({ id: 1, type: 'loading', title: 'Editing Pod nginx...' });
		expect(notificationCenter.items).toHaveLength(0);

		// `toast.promise` resolves in place, under the same id.
		const filed = sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx: timeout' });

		expect(filed).toHaveLength(1);
		expect(filed[0]).toMatchObject({ level: 'error', title: 'Failed to edit Pod nginx: timeout' });
	});

	it('revises the notification when a toast is updated in place', () => {
		sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx' });
		const revised = sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx: timeout' });

		expect(revised).toHaveLength(1);
		expect(revised[0]).toMatchObject({ title: 'Failed to edit Pod nginx: timeout' });
	});

	it('collapses a failure raised over and over into one notification, counting repeats', () => {
		// A polling loop toasts the same error each round, each time as a new toast.
		sync({ id: 1, type: 'error', title: 'HelmRepository "otter": unable to reach repository' });
		sync({ id: 2, type: 'error', title: 'HelmRepository "otter": unable to reach repository' });
		const filed = sync({
			id: 3,
			type: 'error',
			title: 'HelmRepository "otter": unable to reach repository'
		});

		expect(filed).toHaveLength(1);
		expect(filed[0]).toMatchObject({ count: 3 });
	});

	it('does not count an in-place text update as a repeat', () => {
		sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx' });
		const revised = sync({ id: 1, type: 'error', title: 'Failed to edit Pod nginx: timeout' });

		expect(revised[0]).toMatchObject({ count: 1 });
	});

	it('marks a collapsed repeat as unread again', () => {
		sync({ id: 1, type: 'error', title: 'unable to reach repository' });
		notificationCenter.markAllRead();

		const filed = sync({ id: 2, type: 'error', title: 'unable to reach repository' });

		expect(filed[0]).toMatchObject({ read: false });
	});

	it('ignores toasts whose title is a component, having no text to keep', () => {
		expect(sync({ id: 1, type: 'error', title: () => undefined })).toHaveLength(0);
	});

	it('drops the oldest notifications rather than growing without bound', () => {
		for (let id = 1; id <= 205; id++) {
			sync({ id, type: 'error', title: `Message ${id}` });
		}

		const filed = notificationCenter.items;
		expect(filed).toHaveLength(200);
		expect(filed[0]).toMatchObject({ title: 'Message 205' });
	});
});
