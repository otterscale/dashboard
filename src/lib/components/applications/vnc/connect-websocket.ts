import { type Client, createClient, type Transport } from '@connectrpc/connect';
import { RuntimeService } from '@otterscale/api/runtime/v1';

/**
 * A WebSocket-like adapter that bridges noVNC with ConnectRPC VNC streaming.
 *
 * noVNC's Websock layer requires a raw channel with these properties:
 *   send, close, binaryType, onerror, onmessage, onopen, protocol, readyState
 *
 * This adapter implements that interface using:
 *   - VNC server-streaming RPC for receiving VNC data
 *   - WriteVNC unary RPC for sending VNC data
 */
export class ConnectWebSocket {
	// Required by noVNC raw channel interface
	binaryType: BinaryType = 'arraybuffer';
	protocol = '';
	readyState: number = WebSocket.CONNECTING;

	onopen: ((ev: Event) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;

	private sessionId = '';
	private client: Client<typeof RuntimeService>;
	private abortController = new AbortController();

	constructor(
		transport: Transport,
		private cluster: string,
		private namespace: string,
		private name: string
	) {
		this.client = createClient(RuntimeService, transport);
		this.startStream();
	}

	private async startStream() {
		try {
			const stream = this.client.vNC(
				{ cluster: this.cluster, namespace: this.namespace, name: this.name },
				{ signal: this.abortController.signal }
			);

			for await (const response of stream) {
				if (!this.sessionId && response.sessionId) {
					this.sessionId = response.sessionId;
					this.readyState = WebSocket.OPEN;
					this.onopen?.(new Event('open'));
					continue;
				}

				if (response.data && response.data.length > 0) {
					const buffer =
						response.data instanceof ArrayBuffer
							? response.data
							: response.data.buffer.slice(
									response.data.byteOffset,
									response.data.byteOffset + response.data.byteLength
								);
					this.onmessage?.(new MessageEvent('message', { data: buffer }));
				}
			}

			this.handleClose(1000, 'Stream ended');
		} catch (error) {
			if (this.abortController.signal.aborted) return;
			this.onerror?.(new Event('error'));
			this.handleClose(1006, String(error));
		}
	}

	send(data: ArrayBuffer | Uint8Array) {
		if (!this.sessionId || this.readyState !== WebSocket.OPEN) return;

		const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
		this.client.writeVNC({ sessionId: this.sessionId, data: bytes }).catch(() => {
			this.onerror?.(new Event('error'));
			this.close();
		});
	}

	close() {
		this.abortController.abort();
		this.handleClose(1000, 'Client closed');
	}

	private handleClose(code: number, reason: string) {
		if (this.readyState === WebSocket.CLOSED) return;
		this.readyState = WebSocket.CLOSED;
		this.onclose?.(new CloseEvent('close', { code, reason }));
	}
}
