import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shared config (e.g. dashboard host for E2E). */

export const DASHBOARD_IP = '10.102.196.24:30080';

export const DASHBOARD_BASE_URL = `http://${DASHBOARD_IP}/`;

/** Default cluster name when URL parsing cannot determine cluster. */
export const DEFAULT_CLUSTER_NAME = 'pps-cluster-1';

/** `true` writes `.log` files; `false` prints to console only. */
export const ENABLE_E2E_FILE_LOG = false;
/** Playwright browser headless mode toggle (`E2E_HEADLESS=1` or `true` forces headless). */
export const BROWSER_HEADLESS =
	process.env.E2E_HEADLESS === '1' || process.env.E2E_HEADLESS?.toLowerCase() === 'true';
/** Playwright video recording toggle. */
export const ENABLE_E2E_VIDEO = false;

/**
 * Networking cross-pattern whitelist (Constitution Principle X).
 * Domain-specific values live in owning `api/` modules — do not add here unless
 * consumed by two or more Networking patterns (0049–0051).
 */
/** GatewayClass shared by Networking Gateway/HTTPRoute patterns. Empty → test.skip. */
export const NETWORKING_GATEWAY_CLASS_NAME = 'envoy-otterscale';
/** Listener port when patterns create a dedicated Gateway (non-80 avoids HostnameConflict). */
export const NETWORKING_E2E_GATEWAY_LISTENER_PORT = 8899;
/** Max deletes per resource kind during e2e-net preflight cleanup. */
export const E2E_NET_PREFLIGHT_MAX_DELETES_PER_KIND = 20;

/** RapidGen `/run_results` reporting (used by `rapidgen_results.ts`). */
export const RAPIDGEN_API_KEY = '';
export const RAPIDGEN_API_URL = ''//'http://192.168.85.199:6001/run_results';
export const RAPIDGEN_RUN_CODE = '';
export const RAPIDGEN_ENABLE_REPORTING = false;


/** Escape special RegExp characters in a literal string. */
export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const E2E_DIR = join(__dirname, '..');
const LOG_ROOT_DIR = join(E2E_DIR, 'log');
const patternRunDirCache = new Map<string, string>();

function fileSafeTimestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

export function getPatternNameFromModuleUrl(moduleUrl: string): string {
	const modulePath = fileURLToPath(moduleUrl);
	const filename = basename(modulePath);
	const withoutExt = filename.replace(/\.[^.]+$/i, '');
	return withoutExt.replace(/\.(test|spec)$/i, '');
}

export function getPatternLogDirByPatternName(patternName: string): string {
	const envKey = `E2E_PATTERN_RUN_DIR_${patternName.replace(/[^A-Za-z0-9_]/g, '_')}`;
	const envDir = process.env[envKey];
	if (envDir) {
		if (!existsSync(envDir)) {
			mkdirSync(envDir, { recursive: true });
		}
		patternRunDirCache.set(patternName, envDir);
		return envDir;
	}

	const cachedDir = patternRunDirCache.get(patternName);
	if (cachedDir) {
		if (!existsSync(cachedDir)) {
			mkdirSync(cachedDir, { recursive: true });
		}
		return cachedDir;
	}

	const targetDir = join(LOG_ROOT_DIR, `${patternName}_${fileSafeTimestamp()}`);
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}
	patternRunDirCache.set(patternName, targetDir);
	process.env[envKey] = targetDir;
	return targetDir;
}

export function getPatternLogDir(moduleUrl: string): string {
	const patternName = getPatternNameFromModuleUrl(moduleUrl);
	return getPatternLogDirByPatternName(patternName);
}
