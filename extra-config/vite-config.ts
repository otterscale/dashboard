import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';

import type { Plugin } from 'vite';

// Vite ids may carry a `?query` or `#fragment` suffix (SFC subparts, asset
// hints, SVG refs) that must survive path rewriting, or downstream plugins
// lose context.
const splitResolvedIdSuffix = (id: string): [string, string] => {
	// Same `?`/`#` pattern Vite's `cleanUrl` uses:
	// https://github.com/vitejs/vite/blob/main/packages/vite/src/shared/utils.ts#L31
	const index = id.search(/[?#]/);
	if (index === -1) return [id, ''];
	return [id.slice(0, index), id.slice(index)];
};

const reattachSuffixAsResolvedId = (path: string, suffix: string): string => path + suffix;

/**
 * EE overlay resolver. `ee/src/` mirrors `src/` (the CE app); when a file
 * exists at the same relative path in `ee/src/`, it wins. Lets EE replace
 * specific CE files without forking the tree.
 *
 * EE files must reference siblings via `$lib/...`, not `./` or `../`:
 * relative imports from EE resolve against `ee/src/` only and will fail
 * if the sibling exists only in CE.
 */
function libResolver(): Plugin {
	let ceSourceDirectoryPrefix: string;
	let eeSourceDirectory: string;

	const tryOverride = (resolvedId: string): string | null => {
		const [path, suffix] = splitResolvedIdSuffix(resolvedId);
		if (!path.startsWith(ceSourceDirectoryPrefix)) return null;

		const relativePath = path.slice(ceSourceDirectoryPrefix.length);
		const eePath = join(eeSourceDirectory, relativePath);
		if (!existsSync(eePath)) return null;

		return reattachSuffixAsResolvedId(eePath, suffix);
	};

	return {
		name: 'ee-overlay-resolver',
		enforce: 'pre',

		configResolved(config) {
			ceSourceDirectoryPrefix = join(config.root, 'src') + sep;
			eeSourceDirectory = join(config.root, 'ee', 'src');
		},

		async resolveId(source, importer, options) {
			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true
			});
			if (!resolved || resolved.external) return resolved;

			return tryOverride(resolved.id) ?? resolved;
		}
	};
}

export function extraVitePlugins(): Plugin[] {
	return [libResolver()];
}
