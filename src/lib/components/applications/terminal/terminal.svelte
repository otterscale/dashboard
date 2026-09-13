<script lang="ts">
	import '@xterm/xterm/css/xterm.css';

	import { type Transport } from '@connectrpc/connect';
	import type { FitAddon } from '@xterm/addon-fit';
	import type { ITerminalInitOnlyOptions, ITerminalOptions, Terminal } from '@xterm/xterm';
	import { getContext, onMount } from 'svelte';

	import { TERMINAL_BACKGROUND, TERMINAL_THEME } from './terminal-theme';
	import { TTYSession } from './tty-session';

	let {
		cluster,
		namespace,
		podName,
		containerName,
		command
	}: {
		cluster: string;
		namespace: string;
		podName: string;
		containerName: string;
		command: string[];
	} = $props();

	const TERMINAL_OPTIONS: ITerminalOptions & ITerminalInitOnlyOptions = {
		allowProposedApi: true,
		fontFamily: 'Consolas, Monaco, "Lucida Console", monospace',
		fontSize: 14,
		cursorBlink: true,
		scrollback: 10000
	};

	const RESIZE_DEBOUNCE_MS = 100;

	const transport: Transport = getContext('transport');

	let container: HTMLElement | undefined;
	let terminal: Terminal | undefined;
	let fitAddon: FitAddon | undefined;

	let session: TTYSession | null = null;
	let disposed = false;

	// True once the session has ended; input is ignored until Enter starts a new one.
	let awaitingRestart = false;
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;

	function notify(message: string, isError = false): void {
		const color = isError ? '\x1b[31m' : '\x1b[33m';
		terminal?.write(`\r\n${color}${message}\x1b[0m\r\n`);
	}

	function awaitRestart(message: string, isError = false): void {
		notify(`${message} Press Enter to continue.`, isError);
		awaitingRestart = true;
	}

	// Terminal setup

	async function initialize(): Promise<void> {
		const { Terminal } = await import('@xterm/xterm');
		if (disposed || !container) return;

		const term = new Terminal({
			...TERMINAL_OPTIONS,
			theme: TERMINAL_THEME
		});
		terminal = term;

		term.onData(handleData);
		// Keep the remote PTY size in sync with xterm.
		term.onResize(({ cols, rows }) => scheduleRemoteResize(cols, rows));
		// Copy on select; Ctrl+Shift+C would collide with the browser's inspect-element shortcut.
		term.onSelectionChange(() => {
			const selection = term.getSelection();
			if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
		});

		term.open(container);
		await loadAddons(term);
		if (disposed) return;

		handleResize();
		await connect();
	}

	async function loadAddons(term: Terminal): Promise<void> {
		try {
			const [clipboard, fit, search, unicode11, webLinks, webgl] = await Promise.all([
				import('@xterm/addon-clipboard').then((m) => new m.ClipboardAddon()),
				import('@xterm/addon-fit').then((m) => new m.FitAddon()),
				import('@xterm/addon-search').then((m) => new m.SearchAddon()),
				import('@xterm/addon-unicode11').then((m) => new m.Unicode11Addon()),
				import('@xterm/addon-web-links').then((m) => new m.WebLinksAddon()),
				import('@xterm/addon-webgl').then((m) => new m.WebglAddon())
			]);
			if (disposed) return;

			term.loadAddon(clipboard);
			term.loadAddon(fit);
			term.loadAddon(search);
			term.loadAddon(unicode11);
			term.loadAddon(webLinks);
			fitAddon = fit;

			term.unicode.activeVersion = '11';

			webgl.onContextLoss(() => webgl.dispose());
			term.loadAddon(webgl);
		} catch (error) {
			notify(`Failed to load terminal addons: ${error}`, true);
		}
	}

	// FitAddon reserves space for a scrollbar we hide, wasting width; measure the
	// container directly and fall back to FitAddon if cell metrics are unavailable.
	function handleResize(): void {
		const term = terminal;
		// Skip while hidden/transitioning to avoid resizing the PTY to a bogus 2x1 grid.
		if (!term || !container || container.clientWidth === 0 || container.clientHeight === 0) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const cell = (term as any)._core?._renderService?.dimensions?.css?.cell;
		if (cell?.width && cell?.height) {
			const cols = Math.max(2, Math.floor(container.clientWidth / cell.width));
			const rows = Math.max(1, Math.floor(container.clientHeight / cell.height));
			if (cols !== term.cols || rows !== term.rows) term.resize(cols, rows);
		} else {
			fitAddon?.fit();
		}
	}

	// Debounce: dragging to fullscreen fires a burst of sizes; only the final one matters.
	function scheduleRemoteResize(cols: number, rows: number): void {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => session?.resize(cols, rows), RESIZE_DEBOUNCE_MS);
	}

	// Session lifecycle

	async function connect(): Promise<void> {
		const term = terminal;
		if (disposed || !term) return;

		const next = new TTYSession(transport);
		// Assign before opening so input typed during the handshake buffers instead of dropping.
		session = next;

		try {
			await next.open(
				{
					cluster,
					namespace,
					podName,
					containerName,
					command,
					cols: term.cols,
					rows: term.rows
				},
				{ output: writeOutput, closed: (info) => handleClosed(next, info) }
			);
		} catch (error) {
			next.close();
			if (disposed || session !== next) return;
			session = null;
			awaitRestart(`Connection failed: ${error}`, true);
			return;
		}

		if (disposed || session !== next) {
			next.close();
			return;
		}

		// The grid may have changed while the session was being established.
		next.resize(term.cols, term.rows);
	}

	// Every way a session can end lands here. None retry automatically -- Enter starts a new one.
	function handleClosed(
		source: TTYSession,
		info: { graceful: boolean; message?: string; hadOutput: boolean }
	): void {
		if (disposed || session !== source) return;

		source.close();
		session = null;

		// Zero output means every retry would fail the same way -- don't offer one.
		if (info.graceful && !info.hadOutput) {
			notify(
				"Shell exited with no output -- this container doesn't support an interactive session.",
				true
			);
			return;
		}

		const message = info.graceful
			? (info.message ?? 'Session ended.')
			: `Connection lost: ${info.message ?? 'unknown error'}`;
		awaitRestart(message, !info.graceful);
	}

	// Data flow

	// Undecoded: xterm's UTF-8 decoder carries state across writes, so split multi-byte chars still render.
	function writeOutput(data: Uint8Array): void {
		terminal?.write(data);
	}

	function handleData(data: string): void {
		if (awaitingRestart) {
			if (data === '\r' || data === '\n') {
				awaitingRestart = false;
				void connect();
			}
			return;
		}
		session?.write(data);
	}

	// Lifecycle

	onMount(() => {
		void initialize();

		// Refit whenever the container itself resizes (e.g. toggling the dialog's
		// fullscreen), not just on window resize.
		let observer: ResizeObserver | undefined;
		if (container) {
			observer = new ResizeObserver(() => handleResize());
			observer.observe(container);
		}

		return () => {
			disposed = true;
			observer?.disconnect();
			clearTimeout(resizeTimer);
			session?.close();
			session = null;
			terminal?.dispose();
		};
	});
</script>

<svelte:window onresize={handleResize} />

<div
	class="h-full w-full"
	bind:this={container}
	style:--xterm-viewport-background={TERMINAL_BACKGROUND}
></div>

<style>
	:global(.xterm) {
		height: 100% !important;
	}

	:global(.xterm-viewport) {
		overflow-y: hidden !important;
		/* xterm.css hardcodes a black viewport background; repaint it in the theme's
		   background so unfilled rows read as padding, not a black band. */
		background-color: var(--xterm-viewport-background) !important;
	}
</style>
