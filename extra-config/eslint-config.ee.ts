import type { Linter } from 'eslint';

// No-op
export const extraESLintConfigs: Linter.Config[] = [
    {
        files: ['ee/**/*.{js,ts,svelte,svelte.ts,svelte.js}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^\\.\\.?/',
                            message:
                                'Relative imports are not allowed under ee/. Use path aliases like $lib instead (e.g. $lib/components/...).'
                        }
                    ]
                }
            ]
        }
    }
];
