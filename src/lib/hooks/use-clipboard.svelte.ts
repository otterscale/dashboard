import copy from 'clipboard-copy';

type Options = {
	/** The time before the copied status is reset. */
	delay: number;
};

/** Use this hook to copy text to the clipboard and show a copied state.
 *
 * Backed by `clipboard-copy`, which prefers the Async Clipboard API
 * (`navigator.clipboard.writeText`) in secure contexts (HTTPS / localhost)
 * and gracefully falls back to `document.execCommand('copy')` in insecure
 * contexts such as accessing the dashboard via a raw IP over plain HTTP.
 *
 * ## Usage
 * ```svelte
 * <script lang="ts">
 * 		import { UseClipboard } from "$lib/hooks/use-clipboard.svelte";
 *
 * 		const clipboard = new UseClipboard();
 * </script>
 *
 * <button onclick={clipboard.copy('Hello, World!')}>
 *     {#if clipboard.copied === 'success'}
 *         Copied!
 *     {:else if clipboard.copied === 'failure'}
 *         Failed to copy!
 *     {:else}
 *         Copy
 *     {/if}
 * </button>
 * ```
 *
 */
export class UseClipboard {
	#copiedStatus = $state<'success' | 'failure'>();
	private delay: number;
	private timeout: ReturnType<typeof setTimeout> | undefined = undefined;

	constructor({ delay = 500 }: Partial<Options> = {}) {
		this.delay = delay;
	}

	/** Copies the given text to the users clipboard.
	 *
	 * ## Usage
	 * ```ts
	 * clipboard.copy('Hello, World!');
	 * ```
	 *
	 * @param text
	 * @returns
	 */
	async copy(text: string) {
		if (this.timeout) {
			this.#copiedStatus = undefined;
			clearTimeout(this.timeout);
		}

		try {
			await copy(text);
			this.#copiedStatus = 'success';
		} catch {
			this.#copiedStatus = 'failure';
		}

		this.timeout = setTimeout(() => {
			this.#copiedStatus = undefined;
		}, this.delay);

		return this.#copiedStatus;
	}

	/** true when the user has just copied to the clipboard. */
	get copied() {
		return this.#copiedStatus === 'success';
	}

	/**	Indicates whether a copy has occurred
	 * and gives a status of either `success` or `failure`. */
	get status() {
		return this.#copiedStatus;
	}
}
