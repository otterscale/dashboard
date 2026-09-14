import { execSync } from 'node:child_process';
import type { Browser, BrowserContext } from '@playwright/test';

import { BROWSER_HEADLESS } from './utils';

const CLOSE_TIMEOUT_MS = 5_000;

function getBrowserPid(browser: Browser | null, browserPid?: number): number | undefined {
	if (browserPid) {
		return browserPid;
	}

	if (!browser || typeof browser.process !== 'function') {
		return undefined;
	}

	return browser.process()?.pid;
}

export function killWorkerBrowserProcessesOnWindows(browserPid?: number): void {
	if (process.platform !== 'win32' || BROWSER_HEADLESS) {
		return;
	}

	const pid = browserPid;
	if (pid) {
		try {
			execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
		} catch {
			// Process may already be gone.
		}
	}

	try {
		execSync(
			`powershell -NoProfile -Command "$parent=${process.pid}; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and ($_.CommandLine -match 'ms-playwright|playwright\\\\chromium' -or $_.ParentProcessId -eq $parent) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
			{ stdio: 'ignore' }
		);
	} catch {
		// Best-effort cleanup only.
	}
}

export function killOrphanedPlaywrightBrowsersOnWindows(): void {
	killWorkerBrowserProcessesOnWindows();
}

async function detachPages(context: BrowserContext): Promise<void> {
	for (const page of context.pages()) {
		if (page.isClosed()) {
			continue;
		}

		await Promise.race([
			page.goto('about:blank', { timeout: CLOSE_TIMEOUT_MS }).catch(() => {}),
			new Promise<void>((resolve) => {
				setTimeout(resolve, CLOSE_TIMEOUT_MS);
			})
		]);
	}
}

export async function closeContextWithTimeout(context: BrowserContext): Promise<void> {
	if (BROWSER_HEADLESS) {
		await context.close().catch(() => {});
		return;
	}

	await detachPages(context);

	await Promise.race([
		context.close().catch(() => {}),
		new Promise<void>((resolve) => {
			setTimeout(resolve, CLOSE_TIMEOUT_MS);
		})
	]);
}

export async function closeBrowserWithTimeout(browser: Browser, browserPid?: number): Promise<void> {
	if (BROWSER_HEADLESS) {
		await browser.close().catch(() => {});
		return;
	}

	const pid = getBrowserPid(browser, browserPid);

	await Promise.race([
		browser.isConnected() ? browser.close().catch(() => {}) : Promise.resolve(),
		new Promise<void>((resolve) => {
			setTimeout(resolve, CLOSE_TIMEOUT_MS);
		})
	]);

	killWorkerBrowserProcessesOnWindows(pid);
}
