import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import type { TestInfo } from '@playwright/test';

import {
	getPatternLogDir,
	getPatternNameFromModuleUrl,
	RAPIDGEN_API_KEY,
	RAPIDGEN_API_URL,
	RAPIDGEN_ENABLE_REPORTING,
	RAPIDGEN_RUN_CODE
} from './utils';

const SUBMIT_TIMEOUT_MS = 60_000;
const EVIDENCE_WAIT_MS = 3_000;
/** Extra wait on failed tests for Playwright to flush `error-context.md`. */
const ERROR_CONTEXT_WAIT_MS = 10_000;
const EVIDENCE_POLL_MS = 200;
const LOG_PREFIX = '[rapidgen_results]';

export type RapidgenResultStatus = 'passed' | 'failed' | 'skipped';

export type PatternMetadata = {
	feature?: string;
	group_rep_tc_id?: string;
	group_members: string[];
	factor_type?: string;
	group_id?: string;
	generated_at?: string;
	raw: Record<string, string>;
};

type SubmitOptions = {
	note?: string;
	/** Override evidence directory; defaults to this run's Playwright `test-results/` output dir. */
	evidenceDir?: string;
};

type EvidenceFile = {
	/** Path inside the zip archive (flat relative to the evidence dir). */
	archivePath: string;
	absolutePath: string;
};

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function toZipPath(filePath: string, rootDir: string): string {
	return relative(rootDir, filePath).split(sep).join('/');
}

function listFilesRecursive(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFilesRecursive(fullPath));
			continue;
		}
		if (entry.isFile() && entry.name !== 'result.json') {
			files.push(fullPath);
		}
	}
	return files;
}

function buildZipFromFiles(files: EvidenceFile[]): Buffer {
	const sorted = [...files].sort((a, b) => a.archivePath.localeCompare(b.archivePath));
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const file of sorted) {
		const data = readFileSync(file.absolutePath);
		const nameBuf = Buffer.from(file.archivePath, 'utf8');
		const compressed = deflateRawSync(data);
		const crc = crc32(data);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(8, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(data.length, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);
		localHeader.writeUInt16LE(0, 28);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt16LE(0, 12);
		centralHeader.writeUInt16LE(0, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(data.length, 24);
		centralHeader.writeUInt16LE(nameBuf.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(0, 38);
		centralHeader.writeUInt32LE(offset, 42);

		localParts.push(localHeader, nameBuf, compressed);
		centralParts.push(centralHeader, nameBuf);
		offset += localHeader.length + nameBuf.length + compressed.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const endRecord = Buffer.alloc(22);
	endRecord.writeUInt32LE(0x06054b50, 0);
	endRecord.writeUInt16LE(0, 4);
	endRecord.writeUInt16LE(0, 6);
	endRecord.writeUInt16LE(sorted.length, 8);
	endRecord.writeUInt16LE(sorted.length, 10);
	endRecord.writeUInt32LE(centralDirectory.length, 12);
	endRecord.writeUInt32LE(offset, 16);
	endRecord.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function getDashboardRoot(): string {
	return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function getTestResultsRoot(): string {
	return join(getDashboardRoot(), 'test-results');
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads `PATTERN_METADATA_START` … `PATTERN_METADATA_END` from a pattern module.
 */
export function extractPatternMetadata(moduleUrl: string): PatternMetadata | null {
	const sourcePath = fileURLToPath(moduleUrl);
	if (!existsSync(sourcePath)) {
		console.warn(`${LOG_PREFIX} pattern source not found: ${sourcePath}`);
		return null;
	}

	const content = readFileSync(sourcePath, 'utf8');
	const match = content.match(
		/\/\*\s*PATTERN_METADATA_START\s*\n([\s\S]*?)\nPATTERN_METADATA_END\s*\*\//
	);
	if (!match?.[1]) {
		console.warn(`${LOG_PREFIX} PATTERN_METADATA block missing in ${sourcePath}`);
		return null;
	}

	const raw: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || !trimmed.includes('=')) continue;
		const eq = trimmed.indexOf('=');
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim();
		if (key) raw[key] = value;
	}

	const groupMembers = (raw.group_members ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

	return {
		feature: raw.feature,
		group_rep_tc_id: raw.group_rep_tc_id?.trim(),
		group_members: groupMembers,
		factor_type: raw.factor_type,
		group_id: raw.group_id,
		generated_at: raw.generated_at,
		raw
	};
}

export function mapTestStatusToRapidgenResult(status: TestInfo['status']): RapidgenResultStatus {
	if (status === 'passed') return 'passed';
	if (status === 'skipped' || status === 'interrupted') return 'skipped';
	return 'failed';
}

function filesFromDirectory(dir: string): EvidenceFile[] {
	if (!existsSync(dir)) return [];
	return listFilesRecursive(dir).map((absolutePath) => ({
		archivePath: toZipPath(absolutePath, dir),
		absolutePath
	}));
}

function findMatchingTestResultDirs(patternName: string): string[] {
	const resultsRoot = getTestResultsRoot();
	if (!existsSync(resultsRoot)) return [];

	// Playwright folds long titles: `PYP_PAG09_01_0017_N_Layout-95340-HTTP-400-...`
	// so match on the stable pattern id prefix, not the full pattern filename.
	const patternIdMatch = patternName.match(/^(PYP_[A-Za-z0-9]+(?:_\d+)*)/);
	const prefix = patternIdMatch?.[1] ?? patternName.split('_N_')[0] ?? patternName.slice(0, 24);

	return readdirSync(resultsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
		.map((entry) => join(resultsRoot, entry.name))
		.filter((dir) => listFilesRecursive(dir).length > 0)
		.sort((a, b) => {
			try {
				return statSync(b).mtimeMs - statSync(a).mtimeMs;
			} catch {
				return 0;
			}
		});
}

function addEvidenceFile(
	byArchivePath: Map<string, EvidenceFile>,
	archivePath: string,
	absolutePath: string
): void {
	if (!absolutePath || !existsSync(absolutePath)) return;
	if (!byArchivePath.has(archivePath)) {
		byArchivePath.set(archivePath, { archivePath, absolutePath });
	}
}

function testNeedsErrorContext(testInfo: TestInfo): boolean {
	return testInfo.status !== 'passed' && testInfo.status !== 'skipped';
}

function isCompleteErrorContext(content: string): boolean {
	return content.includes('# Test source') && content.length >= 1500;
}

type StackFrame = { file: string; line: number; column: number };

function parseStackFrames(stack: string | undefined): StackFrame[] {
	if (!stack) return [];
	const frames: StackFrame[] = [];
	const pattern = /(?:\(|\s)((?:[A-Za-z]:)?[^:\s()]+?\.[a-zA-Z]+):(\d+):(\d+)/g;
	for (const match of stack.matchAll(pattern)) {
		const file = match[1];
		const line = Number(match[2]);
		const column = Number(match[3]);
		if (!file || !Number.isFinite(line) || !Number.isFinite(column)) continue;
		if (file.includes('node:internal') || file.includes('node_modules')) continue;
		frames.push({ file, line, column });
	}
	return frames;
}

function resolveReadablePath(filePath: string): string | null {
	if (existsSync(filePath)) return filePath;
	const fromCwd = join(process.cwd(), filePath);
	if (existsSync(fromCwd)) return fromCwd;
	return null;
}

function formatTestSourceSnippet(absolutePath: string, errorLine: number, errorMessage: string): string {
	const rawLines = readFileSync(absolutePath, 'utf8').split(/\r?\n/);
	const total = rawLines.length;
	const contextBefore = 100;
	const contextAfter = 100;
	const start = Math.max(1, errorLine - contextBefore);
	const end = Math.min(total, errorLine + contextAfter);
	const width = String(end).length;

	const body: string[] = [];
	for (let lineNo = start; lineNo <= end; lineNo++) {
		const text = rawLines[lineNo - 1] ?? '';
		const prefix = String(lineNo).padStart(width, ' ');
		if (lineNo === errorLine) {
			body.push(`> ${prefix} | ${text}`);
			body.push(`      |         ^ ${errorMessage.split('\n')[0]}`);
		} else {
			body.push(`  ${prefix} | ${text}`);
		}
	}

	return `# Test source\n\n\`\`\`ts\n${body.join('\n')}\n\`\`\`\n`;
}

function buildTestSourceSection(testInfo: TestInfo): string {
	const message = testInfo.error?.message?.trim() || 'Error';
	const frames = parseStackFrames(testInfo.error?.stack);

	const candidates: StackFrame[] = [...frames];
	if (testInfo.file && testInfo.line) {
		candidates.push({
			file: testInfo.file,
			line: testInfo.line,
			column: testInfo.column ?? 1
		});
	}

	// Prefer the throw site (often api/*.ts) over the pattern file caller when both exist.
	const preferred = [
		...candidates.filter((f) => /[\\/]api[\\/]/i.test(f.file) || /[\\/]locator[\\/]/i.test(f.file)),
		...candidates
	];

	for (const frame of preferred) {
		const absolutePath = resolveReadablePath(frame.file);
		if (!absolutePath) continue;
		try {
			return formatTestSourceSnippet(absolutePath, frame.line, message);
		} catch {
			// try next frame
		}
	}

	return `# Test source\n\n\`\`\`\n(source unavailable)\n\`\`\`\n`;
}

/**
 * Playwright-compatible error-context.md including the large `# Test source` section.
 * Used when Playwright has not flushed its own artifact yet (afterEach races teardown).
 */
function buildErrorContextMarkdown(testInfo: TestInfo): string {
	const message = testInfo.error?.message?.trim() || '(no error message)';
	const location =
		testInfo.file && testInfo.line
			? `${testInfo.file}:${testInfo.line}:${testInfo.column ?? 0}`
			: testInfo.file || '(unknown location)';

	return `# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ${testInfo.titlePath.join(' >> ')}
- Location: ${location}

# Error details

\`\`\`
${message}
\`\`\`

${buildTestSourceSection(testInfo)}`;
}

/**
 * Ensure failed runs include a complete `error-context.md` in the zip.
 * Prefer Playwright's flushed file when it already has `# Test source`;
 * otherwise write a full Playwright-style file (not the short stub).
 */
function ensureErrorContextEvidence(
	testInfo: TestInfo,
	byArchivePath: Map<string, EvidenceFile>
): void {
	if (!testNeedsErrorContext(testInfo)) return;

	const outputDir = testInfo.outputDir;
	if (!outputDir) return;

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const targetPath = join(outputDir, 'error-context.md');

	if (existsSync(targetPath)) {
		const existing = readFileSync(targetPath, 'utf8');
		if (isCompleteErrorContext(existing)) {
			byArchivePath.set('error-context.md', {
				archivePath: 'error-context.md',
				absolutePath: targetPath
			});
			return;
		}
	}

	writeFileSync(targetPath, buildErrorContextMarkdown(testInfo), 'utf8');
	console.warn(
		`${LOG_PREFIX} Playwright error-context.md incomplete/missing; wrote full error-context with Test source (${statSync(targetPath).size} bytes)`
	);
	byArchivePath.set('error-context.md', {
		archivePath: 'error-context.md',
		absolutePath: targetPath
	});
}

function gatherEvidenceSnapshot(
	testInfo: TestInfo,
	moduleUrl: string,
	override: string | undefined,
	patternName: string,
	patternLogDir: string
): { source: string; files: Map<string, EvidenceFile> } {
	const byArchivePath = new Map<string, EvidenceFile>();
	let lastSource = 'none';

	const dirs: string[] = [];
	if (override) {
		dirs.push(override);
	} else {
		if (testInfo.outputDir) dirs.push(testInfo.outputDir);
		dirs.push(...findMatchingTestResultDirs(patternName));
	}

	for (const dir of dirs) {
		const dirFiles = filesFromDirectory(dir);
		for (const file of dirFiles) {
			addEvidenceFile(byArchivePath, file.archivePath, file.absolutePath);
		}
		if (dirFiles.length > 0) {
			lastSource = dir;
		}
	}

	for (const attachment of testInfo.attachments) {
		if (!attachment.path || !existsSync(attachment.path)) continue;
		const lowerName = (attachment.name ?? '').toLowerCase();
		const base = basename(attachment.path);
		let archivePath = base;
		if (lowerName === 'video' || base.toLowerCase().endsWith('.webm')) {
			archivePath = 'video.webm';
		} else if (lowerName.includes('error-context') || base.toLowerCase() === 'error-context.md') {
			archivePath = 'error-context.md';
		} else if (attachment.name?.includes('.')) {
			archivePath = attachment.name;
		}
		addEvidenceFile(byArchivePath, archivePath, attachment.path);
		if (lastSource === 'none') lastSource = 'attachments';
	}

	if (existsSync(patternLogDir)) {
		for (const absolutePath of listFilesRecursive(patternLogDir)) {
			const base = basename(absolutePath);
			const archivePath = base.toLowerCase().endsWith('.webm') ? 'video.webm' : base;
			const before = byArchivePath.size;
			addEvidenceFile(byArchivePath, archivePath, absolutePath);
			if (byArchivePath.size > before && lastSource === 'none') {
				lastSource = patternLogDir;
			}
		}
	}

	return { source: lastSource, files: byArchivePath };
}

function evidenceIsReady(testInfo: TestInfo, files: Map<string, EvidenceFile>): boolean {
	const hasVideo = files.has('video.webm');
	if (!hasVideo) return false;
	if (!testNeedsErrorContext(testInfo)) return true;

	const errorContext = files.get('error-context.md');
	if (!errorContext) return false;
	try {
		return isCompleteErrorContext(readFileSync(errorContext.absolutePath, 'utf8'));
	} catch {
		return false;
	}
}

/**
 * Build a flat evidence set matching Playwright `test-results/` layout
 * (`video.webm`, `error-context.md`, …). On failure, waits for error-context.md
 * (or writes a fallback) so RapidGen gets the full failure artifacts.
 */
async function collectEvidenceFiles(
	testInfo: TestInfo,
	moduleUrl: string,
	override?: string
): Promise<{ source: string; files: EvidenceFile[] }> {
	const patternName = getPatternNameFromModuleUrl(moduleUrl);
	const patternLogDir = getPatternLogDir(moduleUrl);
	const waitMs = testNeedsErrorContext(testInfo)
		? Math.max(EVIDENCE_WAIT_MS, ERROR_CONTEXT_WAIT_MS)
		: EVIDENCE_WAIT_MS;
	const started = Date.now();
	let lastSource = 'none';
	let lastFiles = new Map<string, EvidenceFile>();

	do {
		const snapshot = gatherEvidenceSnapshot(
			testInfo,
			moduleUrl,
			override,
			patternName,
			patternLogDir
		);
		lastSource = snapshot.source;
		lastFiles = snapshot.files;

		if (evidenceIsReady(testInfo, lastFiles)) {
			break;
		}

		await sleep(EVIDENCE_POLL_MS);
	} while (Date.now() - started < waitMs);

	// Failed tests must include error-context.md even if Playwright flushes late.
	ensureErrorContextEvidence(testInfo, lastFiles);

	return {
		source: lastSource,
		files: [...lastFiles.values()]
	};
}

/** `test.skip(true, '…')` / `test.fixme(true, '…')` descriptions — the execution comment for a skip. */
function buildSkipComment(testInfo: TestInfo): string | undefined {
	const descriptions = testInfo.annotations
		.filter((annotation) => annotation.type === 'skip' || annotation.type === 'fixme')
		.map((annotation) => annotation.description?.trim())
		.filter((description): description is string => Boolean(description));
	return descriptions.length > 0 ? descriptions.join(' | ') : undefined;
}

function buildNote(testInfo: TestInfo, explicitNote?: string): string | undefined {
	if (explicitNote?.trim()) return explicitNote.trim();
	const skipComment = buildSkipComment(testInfo);
	if (skipComment) return skipComment.slice(0, 2000);
	const errorMessage = testInfo.error?.message?.trim();
	if (errorMessage) return errorMessage.slice(0, 2000);
	return undefined;
}

async function postRunResult(params: {
	testcaseRef: string;
	result: RapidgenResultStatus;
	note?: string;
	zipBuffer?: Buffer;
}): Promise<void> {
	const payload: Record<string, string> = {
		code: RAPIDGEN_RUN_CODE,
		testcase_ref: params.testcaseRef,
		result: params.result
	};
	if (params.note) {
		payload.note = params.note;
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${RAPIDGEN_API_KEY}`
	};

	const hasZip = Boolean(params.zipBuffer && params.zipBuffer.length > 0);
	let body: BodyInit;

	if (hasZip && params.zipBuffer) {
		// Server expects multipart: payload JSON + optional results_content zip.
		const form = new FormData();
		form.append('payload', JSON.stringify(payload));
		form.append(
			'results_content',
			new File([new Uint8Array(params.zipBuffer)], 'results.zip', { type: 'application/zip' })
		);
		body = form;
	} else {
		headers['Content-Type'] = 'application/json';
		body = JSON.stringify(payload);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
	try {
		const response = await fetch(RAPIDGEN_API_URL, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal
		});

		let responseBody: unknown;
		const text = await response.text();
		try {
			responseBody = JSON.parse(text) as unknown;
		} catch {
			responseBody = { raw: text };
		}

		if (!response.ok) {
			const errorText =
				typeof responseBody === 'object' &&
				responseBody &&
				'error' in responseBody &&
				typeof (responseBody as { error: unknown }).error === 'string'
					? (responseBody as { error: string }).error
					: text;
			throw new Error(`HTTP ${response.status}: ${errorText}`);
		}

		const status =
			typeof responseBody === 'object' && responseBody && 'status' in responseBody
				? String((responseBody as { status: unknown }).status)
				: 'ok';
		const attachmentsExtracted =
			typeof responseBody === 'object' &&
			responseBody &&
			'attachments_extracted' in responseBody
				? String((responseBody as { attachments_extracted: unknown }).attachments_extracted)
				: 'n/a';
		console.log(
			`${LOG_PREFIX} submitted ${params.testcaseRef}: ${status} (zip=${hasZip}, attachments_extracted=${attachmentsExtracted})`
		);
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Submits this pattern's Playwright result to RapidGen `/run_results` once per
 * `group_members` TC id (n submits for n members). Same result/note/evidence for each.
 * Zips evidence as flat `test-results` artifacts (`video.webm`, …).
 * Best-effort: never throws into the test runner.
 */
export async function submitPatternResults(
	testInfo: TestInfo,
	moduleUrl: string,
	options: SubmitOptions = {}
): Promise<void> {
	if (!RAPIDGEN_ENABLE_REPORTING) {
		return;
	}

	if (!RAPIDGEN_API_KEY || !RAPIDGEN_RUN_CODE || !RAPIDGEN_API_URL) {
		console.warn(`${LOG_PREFIX} missing RAPIDGEN_* config; skipping submit`);
		return;
	}

	try {
		const metadata = extractPatternMetadata(moduleUrl);
		const testcaseRefs = metadata?.group_members ?? [];
		const memberCount = testcaseRefs.length;
		if (memberCount === 0) {
			console.warn(`${LOG_PREFIX} no group_members TC ids in PATTERN_METADATA; skipping submit`);
			return;
		}

		const result = mapTestStatusToRapidgenResult(testInfo.status);
		let note = buildNote(testInfo, options.note);
		if (result === 'skipped' && !note) {
			// A skipped TC with a blank note is undocumented in RapidGen; never submit one.
			note = `Skipped: ${testInfo.titlePath.join(' >> ')} — no reason recorded. Use test.skip(true, '<why this case was not executed>') to document skips.`;
			console.warn(
				`${LOG_PREFIX} skipped result has no execution comment; submitting placeholder note`
			);
		}
		const evidence = await collectEvidenceFiles(testInfo, moduleUrl, options.evidenceDir);

		let zipBuffer: Buffer | undefined;
		if (evidence.files.length > 0) {
			try {
				zipBuffer = buildZipFromFiles(evidence.files);
				console.log(
					`${LOG_PREFIX} evidence ready (${evidence.source}): ${evidence.files.length} file(s), ${zipBuffer.length} bytes — ${evidence.files.map((f) => f.archivePath).join(', ')}`
				);
			} catch (error) {
				console.warn(
					`${LOG_PREFIX} failed to zip evidence`,
					error instanceof Error ? error.message : String(error)
				);
			}
		} else {
			console.warn(`${LOG_PREFIX} no evidence files found; submitting without results_content`);
		}

		console.log(
			`${LOG_PREFIX} submitting ${memberCount} result(s) for group_members=[${testcaseRefs.join(',')}] status=${result}`
		);

		for (let i = 0; i < memberCount; i++) {
			const testcaseRef = testcaseRefs[i]!;
			console.log(`${LOG_PREFIX} submit ${i + 1}/${memberCount} testcase_ref=${testcaseRef}`);
			try {
				await postRunResult({
					testcaseRef,
					result,
					note,
					zipBuffer
				});
			} catch (error) {
				console.warn(
					`${LOG_PREFIX} submit ${i + 1}/${memberCount} failed for testcase_ref=${testcaseRef}`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	} catch (error) {
		console.warn(
			`${LOG_PREFIX} submit failed`,
			error instanceof Error ? error.message : String(error)
		);
	}
}
