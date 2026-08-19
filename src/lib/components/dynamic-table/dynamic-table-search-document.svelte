<script lang="ts">
	import BookIcon from '@lucide/svelte/icons/book';

	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Kbd from '$lib/components/ui/kbd/index.js';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Sheet.Root>
				<Sheet.Trigger
					{...props}
					aria-label="Document"
					class={buttonVariants({ variant: 'outline', size: 'icon' })}
				>
					<BookIcon size={16} />
				</Sheet.Trigger>
				<Sheet.Content side="right" class="min-w-[23vw]">
					<Sheet.Header>
						<Sheet.Title>Liqe Query Language Documentation</Sheet.Title>
						<Sheet.Description>
							Liqe is a Lucene-like query language for filtering and searching data. You can use
							Liqe queries in the search box to filter table rows using field-based expressions.
						</Sheet.Description>
					</Sheet.Header>
					<div class="overflow-auto p-4 text-sm">
						<h3 class="font-semibold">Basic Syntax</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Implicit search (all fields): resourceName</p>
							<p>Field matching: Name:resourceName</p>
							<p>Nested fields: raw.metadata.name:resourceName</p>
							<p>Field names with spaces: "full name":Alice</p>
							<p>Quoted values (case-sensitive): Name:"resourceName"</p>
							<p>Unquoted values are case-insensitive: Name:resourcename</p>
							<p>Phrases (exact match with spaces): Name:"resource name"</p>
						</div>

						<br />

						<h3 class="font-semibold">Comparisons &amp; Ranges</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Equal: age:=18</p>
							<p>Greater than / greater or equal: age:&gt;18, age:&gt;=18</p>
							<p>Less than / less or equal: age:&lt;18, age:&lt;=18</p>
							<p>Inclusive range: age:[18 TO 30]</p>
							<p>Exclusive range: age:{'{'}18 TO 30{'}'}</p>
						</div>

						<br />

						<h3 class="font-semibold">Wildcards &amp; Regex</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Prefix wildcard: Name:foo*</p>
							<p>Single-character wildcard: Name:foo?bar</p>
							<p>Combined: Name:foo*bar</p>
							<p>Regex: Name:/^foo.*bar$/</p>
							<p>Regex with flags (e.g. case-insensitive): Name:/^foo.*bar$/i</p>
						</div>

						<br />

						<h3 class="font-semibold">Special Values</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Boolean: active:true, active:false</p>
							<p>Null: description:null</p>
						</div>

						<br />

						<h3 class="font-semibold">Operators</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>AND, OR, NOT</p>
							<p>Implicit AND: Name:foo Namespace:ns</p>
							<p>Negation: NOT Name:foo, -Name:foo</p>
							<p>Grouping with parentheses: (Name:foo OR Name:bar) AND Namespace:ns</p>
						</div>

						<br />

						<h3 class="font-semibold">Not Supported</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Fuzzy searches (e.g. foo~)</p>
							<p>Proximity searches (e.g. "foo bar"~4)</p>
							<p>Term boosting (e.g. foo^4)</p>
						</div>

						<br />

						<h3 class="font-semibold">Tips</h3>
						<div class="space-y-1 p-4 font-mono">
							<p>Use <kbd>ctrl</kbd> + <kbd>⏎</kbd> to search.</p>
							<p>Press <kbd>/</kbd> to focus the search box.</p>
							<p>Press <kbd>esc</kbd> to clear the filter.</p>
						</div>
					</div>
					<Sheet.Footer>
						<p class="mt-4 text-xs text-muted-foreground">
							For advanced usage, refer to the <a
								href="https://github.com/gajus/liqe"
								target="_blank"
								class="underline">Liqe documentation</a
							>.
						</p>
					</Sheet.Footer>
				</Sheet.Content>
			</Sheet.Root>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>Search Documentation</Tooltip.Content>
</Tooltip.Root>
