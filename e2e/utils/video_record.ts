import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { ENABLE_E2E_VIDEO, getPatternLogDir, getPatternNameFromModuleUrl } from './utils';

const VIDEO_FINALIZE_TIMEOUT_MS = 10_000;

function sanitizeFilename(text: string): string {
	return text
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.replace(/_+/g, '_')
		.trim()
		.slice(0, 120);
}

function getTargetVideoPath(testInfo: TestInfo, moduleUrl: string): string {
	const patternName = getPatternNameFromModuleUrl(moduleUrl);
	const patternDir = getPatternLogDir(moduleUrl);
	const titlePart = sanitizeFilename(testInfo.title) || 'test';
	const retryPart = testInfo.retry > 0 ? `_retry${testInfo.retry}` : '';
	return join(patternDir, `${patternName}_${titlePart}${retryPart}.webm`);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T | null> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<null>((resolve) => {
				timeoutId = setTimeout(() => {
					console.warn(`[video_record] ${label} timed out after ${timeoutMs}ms`);
					resolve(null);
				}, timeoutMs);
			})
		]);
	} catch (error) {
		console.warn(`[video_record] ${label} failed`, error instanceof Error ? error.message : String(error));
		return null;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

async function closePageAndContextBestEffort(page: Page): Promise<void> {
	try {
		if (!page.isClosed()) {
			await page.close();
		}
	} catch {
		// Best-effort teardown so headed runs do not leave browser workers hanging.
	}

	try {
		await page.context().close();
	} catch {
		// Context may already be closed by Playwright fixture teardown.
	}
}

async function copyVideoFromAttachments(testInfo: TestInfo, targetPath: string): Promise<boolean> {
	for (const attachment of testInfo.attachments) {
		if (attachment.name !== 'video' || !attachment.path) continue;
		if (!existsSync(attachment.path)) continue;
		copyFileSync(attachment.path, targetPath);
		return true;
	}
	return false;
}

async function waitForVideoAttachment(testInfo: TestInfo, timeoutMs: number): Promise<string | null> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		for (const attachment of testInfo.attachments) {
			if (attachment.name !== 'video' || !attachment.path) continue;
			if (!existsSync(attachment.path)) continue;
			return attachment.path;
		}
		await sleep(200);
	}
	return null;
}

/**
 * Also place `video.webm` into Playwright's outputDir so RapidGen can zip
 * `test-results/` during afterEach (Playwright may not write there until later).
 */
function mirrorVideoToTestResults(testInfo: TestInfo, sourcePath: string): void {
	if (!existsSync(sourcePath) || !testInfo.outputDir) return;
	try {
		if (!existsSync(testInfo.outputDir)) {
			mkdirSync(testInfo.outputDir, { recursive: true });
		}
		copyFileSync(sourcePath, join(testInfo.outputDir, 'video.webm'));
	} catch (error) {
		console.warn(
			'[video_record] failed to mirror video into test-results',
			error instanceof Error ? error.message : String(error)
		);
	}
}

/**
 * Saves Playwright video into `e2e/log/<pattern-name>_<run-timestamp>/`.
 * Closes page/context first so video file is finalized, then copies it.
 * Also mirrors `video.webm` into `testInfo.outputDir` for RapidGen evidence.
 * Falls back to video attachments when needed.
 */
export async function saveTestVideoToPatternLogDir(page: Page, testInfo: TestInfo, moduleUrl: string): Promise<void> {
	if (!ENABLE_E2E_VIDEO) {
		await closePageAndContextBestEffort(page);
		return;
	}

	const targetPath = getTargetVideoPath(testInfo, moduleUrl);
	const pageVideo = page.video();

	if (pageVideo) {
		await closePageAndContextBestEffort(page);

		const saved = await withTimeout(pageVideo.saveAs(targetPath), VIDEO_FINALIZE_TIMEOUT_MS, 'video.saveAs');
		if (saved !== null && existsSync(targetPath)) {
			mirrorVideoToTestResults(testInfo, targetPath);
			return;
		}

		const videoPath = await withTimeout(pageVideo.path(), VIDEO_FINALIZE_TIMEOUT_MS, 'video.path');
		if (videoPath && existsSync(videoPath)) {
			copyFileSync(videoPath, targetPath);
			mirrorVideoToTestResults(testInfo, targetPath);
			return;
		}
	}

	if (await copyVideoFromAttachments(testInfo, targetPath)) {
		mirrorVideoToTestResults(testInfo, targetPath);
		return;
	}

	const attachmentPath = await waitForVideoAttachment(testInfo, VIDEO_FINALIZE_TIMEOUT_MS);
	if (attachmentPath) {
		copyFileSync(attachmentPath, targetPath);
		mirrorVideoToTestResults(testInfo, targetPath);
	}
}
