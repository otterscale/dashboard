import { appendFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENABLE_E2E_FILE_LOG, getPatternLogDirByPatternName } from './utils';

export type Logger = {
	normal(message: string, ...extra: unknown[]): void;
	warn(message: string, ...extra: unknown[]): void;
	error(message: string, ...extra: unknown[]): void;
};

export const DEFAULT_CASE_ID_FIELD = 'caseId';
export const DEFAULT_FAILURE_STAGE_FIELD = 'failureStage';

export type FailureContext = {
	caseId: string;
	failureStage: string;
	configName?: string;
	modelName?: string;
	reason?: string;
};

export type RequiredFailureContext = FailureContext & {
	configName: string;
};

function normalizeRequiredText(value: string | undefined, fieldName: string): string {
	const normalized = value?.trim();
	if (!normalized) {
		throw new Error(`[logger] missing required failure context field: ${fieldName}`);
	}
	return normalized;
}

export function buildFailureContext(context: FailureContext): RequiredFailureContext {
	return {
		caseId: normalizeRequiredText(context.caseId, DEFAULT_CASE_ID_FIELD),
		failureStage: normalizeRequiredText(context.failureStage, DEFAULT_FAILURE_STAGE_FIELD),
		configName: normalizeRequiredText(context.configName, 'configName'),
		modelName: context.modelName,
		reason: context.reason
	};
}

export function hasRequiredFailureContextFields(context: Partial<FailureContext> | null | undefined): boolean {
	return Boolean(context?.caseId?.trim() && context?.failureStage?.trim() && context?.configName?.trim());
}

/** One active log file per pattern/test folder; all module loggers append to the same file. */
const sharedLogFileByFolder = new Map<string, string>();

function formatExtra(args: unknown[]): string {
	if (args.length === 0) return '';
	try {
		return ` ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
	} catch {
		return ' [unserializable]';
	}
}

/** ISO timestamp with `:` and `.` replaced for safe filenames (e.g. `2026-04-20T12-34-56-789Z`). */
function fileSafeTimestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function getCallerTestFolderName(): string | null {
	const stack = new Error().stack;
	if (!stack) return null;

	const lines = stack.split('\n');
	for (const line of lines) {
		const match = line.match(/((?:file:\/\/\/)?[^\s()]+\.test\.[cm]?[jt]s)/i);
		if (!match?.[1]) continue;

		const matchedPath = match[1];
		const callerPath = matchedPath.startsWith('file:///') ? fileURLToPath(matchedPath) : matchedPath;
		const filename = basename(callerPath);
		const withoutExt = filename.replace(/\.[^.]+$/i, '');
		return withoutExt.replace(/\.(test|spec)$/i, '');
	}

	return null;
}

/**
 * Writes to `e2e/log/<folder>/<folder>_<timestamp>.log`.
 * If called from `*.test.ts/js`, `<folder>` uses the test filename without `.test`.
 * Otherwise it falls back to the provided `basename`.
 * and also prints to console.
 */
export function createLogger(basename: string): Logger {
	function writeLine(level: 'NORMAL' | 'WARN' | 'ERROR', message: string, extra: unknown[]): void {
		if (!ENABLE_E2E_FILE_LOG) return;
		const folderName = getCallerTestFolderName() ?? basename;
		let logFile = sharedLogFileByFolder.get(folderName);
		if (!logFile) {
			const patternLogDir = getPatternLogDirByPatternName(folderName);
			logFile = join(patternLogDir, `${folderName}_${fileSafeTimestamp()}.log`);
			sharedLogFileByFolder.set(folderName, logFile);
		}
		const ts = new Date().toISOString();
		const line = `[${ts}] [${level}] ${message}${formatExtra(extra)}\n`;
		appendFileSync(logFile, line, 'utf-8');
	}

	return {
		normal(message: string, ...extra: unknown[]) {
			writeLine('NORMAL', message, extra);
			console.log(message, ...extra);
		},
		warn(message: string, ...extra: unknown[]) {
			writeLine('WARN', message, extra);
			console.warn(message, ...extra);
		},
		error(message: string, ...extra: unknown[]) {
			writeLine('ERROR', message, extra);
			console.error(message, ...extra);
		}
	};
}
