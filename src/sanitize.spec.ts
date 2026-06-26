import DOMPurify from 'isomorphic-dompurify';
import { describe, expect, it } from 'vitest';

const sanitize = (html: string): string => DOMPurify.sanitize(html) as string;

// App sanitizes Shiki output with default config (code.svelte.ts).
// Guards against a dompurify upgrade silently stripping highlight markup.
describe('sanitize · preserves Shiki highlighting', () => {
	it('keeps color spans and pre class', () => {
		const shiki =
			'<pre class="shiki" style="color:#e1e4e8"><code><span style="color:#F97583">const</span></code></pre>';
		const out = sanitize(shiki);
		expect(out.toLowerCase()).toMatch(/color:\s*(#f97583|rgb\(\s*249,\s*117,\s*131\s*\))/);
		expect(out).toContain('class="shiki"');
	});
});
