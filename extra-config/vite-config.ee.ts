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
    const root = import.meta.dirname;

    const ceSourceDirectory = join(root, 'src');
    const eeSourceDirectory = join(root, 'ee', 'src');

    // Trailing separator prevents prefix collisions like `src-foo/`.
    const ceSourceDirectoryPrefix = ceSourceDirectory + sep;

    const tryOverride = (resolvedId: string): string | null => {
        const [path, suffix] = splitResolvedIdSuffix(resolvedId);

        // Only `src/` files are candidates (skips node_modules, virtual modules, etc.).
        if (!path.startsWith(ceSourceDirectoryPrefix)) return null;

        const relativePath = path.slice(ceSourceDirectoryPrefix.length);
        const eePath = join(eeSourceDirectory, relativePath);

        // No EE counterpart — fall through to original resolution.
        // TODO: cache this negative result to avoid fs checks on every import of the same CE file.
        if (!existsSync(eePath)) return null;

        // Re-attach suffix so SFC subpart routing and fragment refs still work.
        return reattachSuffixAsResolvedId(eePath, suffix);
    };

    return {
        name: 'ee-overlay-resolver',
        enforce: 'pre',

        async resolveId(source, importer, options) {
            // Let the rest of the chain resolve first, then decide whether to override.
            // `skipSelf` blocks recursion into this hook.
            const resolved = await this.resolve(source, importer, {
                ...options,
                skipSelf: true
            });

            // null → unresolved, let Vite surface the error.
            // external → leave externalized deps (CDN urls, etc.) alone.
            if (!resolved || resolved.external) return resolved;

            return tryOverride(resolved.id) ?? resolved;
        }
    };
}

export function extraVitePlugins(): Plugin[] {
    return [libResolver()];
}