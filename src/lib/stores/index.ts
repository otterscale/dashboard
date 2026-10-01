import { type Writable, writable } from 'svelte/store';

import { browser } from '$app/environment';
import { resolve } from '$app/paths';
import { m } from '$lib/messages';
import type { Path } from '$lib/path';

// Create a writable store that persists to localStorage
function persistentWritable<T>(key: string, initialValue: T): Writable<T> {
	// Get initial value from localStorage if in browser
	const getStoredValue = () => {
		if (!browser) return initialValue;
		try {
			const stored = localStorage.getItem(key);
			return stored ? JSON.parse(stored) : initialValue;
		} catch {
			return initialValue;
		}
	};

	const store = writable<T>(getStoredValue());

	// Subscribe to store changes and persist to localStorage
	if (browser) {
		store.subscribe((value) => {
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch (error) {
				console.warn(`Failed to persist ${key} to localStorage:`, error);
			}
		});
	}

	return store;
}

// `simple` speaks the user's language and hides Kubernetes internals;
// `advanced` shows the system as-is for operators who want to work close to it.
export type ViewMode = 'simple' | 'advanced';

interface AppStores {
	// Navigation
	breadcrumbs: Writable<Path[]>;

	// Role
	role: Writable<string>;

	// Presentation
	viewMode: Writable<ViewMode>;
}

// Create stores
const createStores = (): AppStores => ({
	breadcrumbs: writable<Path[]>([{ title: m.home(), url: resolve('/') }]),
	// Persistent role store
	role: persistentWritable<string>('otterscale:role', ''),
	viewMode: persistentWritable<ViewMode>('otterscale:view-mode', 'simple')
});

// Export individual stores
export const { breadcrumbs, role, viewMode } = createStores();
