import { toast } from 'svelte-sonner';

import { siteConfig } from '$lib/config/site';
import {
	type Notification,
	notificationCenter,
	type NotificationLevel
} from '$lib/stores/notifications.svelte';

type ActiveToast = ReturnType<typeof toast.getActiveToasts>[number];

/** `crypto.randomUUID` needs a secure context; the dashboard is also served over plain HTTP. */
let counter = 0;
function nextId(): string {
	counter += 1;
	return `toast-${Date.now()}-${counter}`;
}

/** Only failures are worth keeping; 'loading' is filed once it resolves. */
function levelOf(type: ActiveToast['type']): NotificationLevel | undefined {
	switch (type) {
		case 'error':
		case 'warning':
			return type;
		default:
			return undefined;
	}
}

/** Toast titles and descriptions may also be components, which have no text to keep. */
function textOf(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Files svelte-sonner's error and warning toasts into the notification centre.
 * `sync()` reads sonner's live toast state, so calling it from an `$effect`
 * subscribes to it — the root layout does exactly that.
 */
class ToastRecorder {
	// sonner's ids restart at 0 on every page load, so this only ever keys one session.
	#recorded = new Map<string | number, { id: string; signature: string }>();

	sync(): void {
		const active = toast.getActiveToasts();

		for (const activeToast of active) {
			const level = levelOf(activeToast.type);
			const title = textOf(activeToast.title);
			if (level === undefined || title === undefined) continue;

			const content = textOf(activeToast.description) ?? '';
			// `toast.promise` reuses one id for loading → error, and a toast can be
			// updated in place, so the same id can legitimately carry new text.
			const signature = `${level} ${title} ${content}`;
			const recorded = this.#recorded.get(activeToast.id);
			if (recorded?.signature === signature) continue;

			if (recorded) {
				this.#recorded.set(activeToast.id, { id: recorded.id, signature });
				notificationCenter.patch(recorded.id, {
					level,
					title,
					content,
					read: false,
					updated: new Date()
				});
			} else {
				const id = this.#file(signature, level, title, content);
				this.#recorded.set(activeToast.id, { id, signature });
			}
		}

		// A toast never comes back once it leaves the list; its entry is dead weight.
		const live = new Set(active.map((activeToast) => activeToast.id));
		for (const id of this.#recorded.keys()) {
			if (!live.has(id)) this.#recorded.delete(id);
		}
	}

	#file(signature: string, level: NotificationLevel, title: string, content: string): string {
		const now = new Date();

		// A failing polling loop raises the same toast over and over; count it on
		// the latest notification instead of filing a duplicate under it.
		const latest = notificationCenter.items[0];
		if (latest && `${latest.level} ${latest.title} ${latest.content}` === signature) {
			notificationCenter.patch(latest.id, { count: latest.count + 1, read: false, updated: now });
			return latest.id;
		}

		const notification: Notification = {
			id: nextId(),
			from: siteConfig.title,
			level,
			title,
			content,
			count: 1,
			read: false,
			created: now,
			updated: now
		};

		notificationCenter.add(notification);
		return notification.id;
	}
}

export const toastRecorder = new ToastRecorder();
