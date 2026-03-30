declare module '@novnc/novnc' {
	export default class RFB extends EventTarget {
		constructor(
			target: HTMLElement,
			urlOrChannel: string | WebSocket,
			options?: {
				shared?: boolean;
				credentials?: { username?: string; password?: string; target?: string };
				repeaterID?: string;
				wsProtocols?: string[];
				scaleViewport?: boolean;
				resizeSession?: boolean;
			}
		);

		scaleViewport: boolean;
		resizeSession: boolean;
		viewOnly: boolean;
		clipViewport: boolean;
		showDotCursor: boolean;

		disconnect(): void;
		sendCredentials(credentials: { username?: string; password?: string; target?: string }): void;
		sendKey(keysym: number, code: string | null, down?: boolean): void;
		sendCtrlAltDel(): void;
		focus(): void;
		blur(): void;
	}
}
