/* eslint-disable @typescript-eslint/no-explicit-any */
// Placeholder — the enterprise edition overlays this file (ee/src).

export type SmtpSettings = any;
export type AlertRule = any;
export type AlertingOverview = any;
export type TestPhase = any;

export class AlertingConflictError extends Error {}

export function parseAlerting(...args: any[]): any {
	void args;
	return {};
}

export async function loadAlerting(...args: any[]): Promise<AlertingOverview | null> {
	void args;
	return null;
}

export async function saveAlerting(...args: any[]): Promise<any> {
	void args;
	return {};
}

export async function disableAlerting(...args: any[]): Promise<void> {
	void args;
}

export async function sendTestEmail(...args: any[]): Promise<void> {
	void args;
}
