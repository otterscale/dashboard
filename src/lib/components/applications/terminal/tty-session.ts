import { type Client, createClient, type Transport } from '@connectrpc/connect';
import { RuntimeService } from '@otterscale/api/runtime/v1';

export interface TTYSessionOptions {
	cluster: string;
	namespace: string;
	podName: string;
	containerName: string;
	command: string[];
	cols: number;
	rows: number;
}

export interface TTYSessionHandlers {
	/** Raw stdout/stderr bytes, undecoded so a multi-byte char split across chunks still renders. */
	output: (data: Uint8Array) => void;
	/** Session ended; `graceful` false means it dropped, `hadOutput` false means nothing was ever printed. */
	closed: (info: { graceful: boolean; message?: string; hadOutput: boolean }) => void;
}

const ENCODER = new TextEncoder();

/**
 * One interactive exec session: output streams in via `ExecuteTTY`, stdin goes
 * out through unary `WriteTTY` calls.
 *
 * Only one write is ever in flight -- concurrent writes reorder characters,
 * since the server writes each one from its own goroutine. Keystrokes that
 * arrive mid-write buffer and go out together once it completes.
 */
export class TTYSession {
	private client: Client<typeof RuntimeService>;
	private handlers: TTYSessionHandlers | null = null;
	private abortController = new AbortController();
	private sessionId = '';
	private closed = false;
	private hadOutput = false;

	// Stdin queued because a write is in flight, or the session id hasn't arrived yet.
	private pendingInput = '';
	private writing = false;

	// Only the newest size matters, so a pending resize is overwritten rather
	// than queued.
	private pendingResize: { cols: number; rows: number } | null = null;
	private resizing = false;

	constructor(transport: Transport) {
		this.client = createClient(RuntimeService, transport);
	}

	/** Resolves once the remote side is ready to accept input. */
	open(options: TTYSessionOptions, handlers: TTYSessionHandlers): Promise<void> {
		this.handlers = handlers;
		return new Promise<void>((resolve, reject) => {
			void this.consume(options, resolve, reject);
		});
	}

	/** Queues stdin data. Call order is preserved. */
	write(data: string): void {
		if (this.closed) return;
		this.pendingInput += data;
		void this.flushInput();
	}

	/** Reports the new terminal grid size to the remote PTY. */
	resize(cols: number, rows: number): void {
		if (this.closed) return;
		this.pendingResize = { cols, rows };
		void this.flushResize();
	}

	/** Tears the session down. Safe to call more than once. */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.pendingInput = '';
		this.pendingResize = null;
		this.abortController.abort();
	}

	private async consume(
		options: TTYSessionOptions,
		resolve: () => void,
		reject: (error: unknown) => void
	): Promise<void> {
		const { signal } = this.abortController;
		let established = false;

		try {
			const stream = this.client.executeTTY(
				{
					cluster: options.cluster,
					namespace: options.namespace,
					name: options.podName,
					container: options.containerName,
					command: options.command,
					tty: true,
					rows: options.rows,
					cols: options.cols
				},
				{ signal }
			);

			for await (const response of stream) {
				if (!established && response.sessionId) {
					this.sessionId = response.sessionId;
					established = true;
					resolve();
					// Release input/resizes buffered while the session id was in flight.
					void this.flushInput();
					void this.flushResize();
				}

				if (response.stdout?.length) {
					this.hadOutput = true;
					this.handlers?.output(response.stdout);
				}
				if (response.stderr?.length) {
					this.hadOutput = true;
					this.handlers?.output(response.stderr);
				}
			}

			if (!established) {
				reject(new Error('TTY stream ended before a session was established'));
				return;
			}
			if (!signal.aborted) this.handlers?.closed({ graceful: true, hadOutput: this.hadOutput });
		} catch (error) {
			if (signal.aborted) {
				if (!established) reject(error);
				return;
			}
			if (established) {
				this.handlers?.closed({
					graceful: false,
					message: String(error),
					hadOutput: this.hadOutput
				});
			} else {
				reject(error);
			}
		}
	}

	private async flushInput(): Promise<void> {
		if (this.writing || this.closed || !this.sessionId) return;

		this.writing = true;
		try {
			while (this.pendingInput && !this.closed) {
				const chunk = this.pendingInput;
				this.pendingInput = '';
				await this.client.writeTTY(
					{ sessionId: this.sessionId, stdin: ENCODER.encode(chunk) },
					{ signal: this.abortController.signal }
				);
			}
		} catch (error) {
			if (!this.abortController.signal.aborted) {
				this.handlers?.closed({
					graceful: false,
					message: String(error),
					hadOutput: this.hadOutput
				});
			}
		} finally {
			this.writing = false;
		}
	}

	private async flushResize(): Promise<void> {
		if (this.resizing || this.closed || !this.sessionId) return;

		this.resizing = true;
		try {
			while (this.pendingResize && !this.closed) {
				const { cols, rows } = this.pendingResize;
				this.pendingResize = null;
				await this.client.resizeTTY(
					{ sessionId: this.sessionId, cols, rows },
					{ signal: this.abortController.signal }
				);
			}
		} catch {
			// A dropped resize just leaves a stale grid size; the next resize fixes it.
		} finally {
			this.resizing = false;
		}
	}
}
