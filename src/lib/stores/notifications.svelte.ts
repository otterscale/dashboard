import { browser } from '$app/environment';

export type NotificationLevel = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
	id: string;
	from: string;
	level: NotificationLevel;
	title: string;
	content: string;
	/** How often this exact message was raised; repeats collapse instead of piling up. */
	count: number;
	read: boolean;
	created: Date;
	updated: Date;
}

/** Newest-first cap, so a chatty session cannot grow the list without bound. */
export const MAX_NOTIFICATIONS = 200;

/** Notifications this stale are pruned on load; nobody rereads last week's errors. */
const MAX_NOTIFICATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'otterscale:notifications';

const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ['success', 'error', 'warning', 'info'];

/** Rebuild notifications from JSON: revive dates, drop malformed or stale entries. */
export function reviveNotifications(stored: unknown): Notification[] {
	if (!Array.isArray(stored)) return [];

	const cutoff = Date.now() - MAX_NOTIFICATION_AGE_MS;
	const revived: Notification[] = [];

	for (const item of stored) {
		if (typeof item !== 'object' || item === null) continue;
		const raw = item as Record<string, unknown>;
		if (typeof raw.id !== 'string' || typeof raw.title !== 'string') continue;

		/* eslint-disable svelte/prefer-svelte-reactivity -- immutable snapshots; reactivity comes from reassigning `items` */
		const created = new Date(raw.created as string);
		const updated = new Date(raw.updated as string);
		/* eslint-enable svelte/prefer-svelte-reactivity */
		if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) continue;
		if (updated.getTime() < cutoff) continue;

		revived.push({
			id: raw.id,
			from: typeof raw.from === 'string' ? raw.from : '',
			level: NOTIFICATION_LEVELS.includes(raw.level as NotificationLevel)
				? (raw.level as NotificationLevel)
				: 'info',
			title: raw.title,
			content: typeof raw.content === 'string' ? raw.content : '',
			count: typeof raw.count === 'number' && raw.count >= 1 ? Math.floor(raw.count) : 1,
			read: raw.read === true,
			created,
			updated
		});
	}

	return revived.slice(0, MAX_NOTIFICATIONS);
}

/** The notification centre's state: a capped, localStorage-backed list, newest first. */
export class NotificationCenter {
	// Every mutation reassigns the whole array, so raw state skips the proxy overhead.
	items = $state.raw<Notification[]>([]);

	readonly unreadCount = $derived(this.items.filter((n) => !n.read).length);

	constructor() {
		if (!browser) return;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) this.items = reviveNotifications(JSON.parse(stored));
		} catch {
			// A corrupt store starts over empty.
		}
	}

	#commit(items: Notification[]): void {
		this.items = items.slice(0, MAX_NOTIFICATIONS);
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
		} catch (error) {
			console.warn(`Failed to persist ${STORAGE_KEY} to localStorage:`, error);
		}
	}

	add(notification: Notification): void {
		this.#commit([notification, ...this.items]);
	}

	patch(id: string, patch: Partial<Omit<Notification, 'id'>>): void {
		this.#commit(this.items.map((n) => (n.id === id ? { ...n, ...patch } : n)));
	}

	markAllRead(): void {
		this.#commit(this.items.map((n) => (n.read ? n : { ...n, read: true })));
	}

	clearAll(): void {
		this.#commit([]);
	}

	delete(id: string): void {
		this.#commit(this.items.filter((n) => n.id !== id));
	}
}

export const notificationCenter = new NotificationCenter();
