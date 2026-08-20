<script lang="ts">
	import BookIcon from '@lucide/svelte/icons/book';

	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type Rule = { label: string; examples: string[] };
	type Section = { title: string; rules: Rule[] };

	const sections: Section[] = [
		{
			title: 'Basic',
			rules: [
				{ label: 'Search all fields', examples: ['phrase'] },
				{ label: 'Match one field', examples: ['field:phrase'] },
				{ label: 'Nested field', examples: ['field.subfield:phrase'] },
				{ label: 'Field name with spaces', examples: ['"field name":phrase'] },
				{ label: 'Phrase with spaces', examples: ['field:"phrase term"'] }
			]
		},
		{
			title: 'Comparisons',
			rules: [
				{ label: 'Equal', examples: ['field:=number'] },
				{ label: 'Greater than', examples: ['field:>number'] },
				{ label: 'Greater than, or equal', examples: ['field:>=number'] },
				{ label: 'Less than', examples: ['field:<number'] },
				{ label: 'Less than, or equal', examples: ['field:<=number'] },
				{ label: 'Inclusive range', examples: ['field:[number TO number]'] },
				{ label: 'Exclusive range', examples: ['field:{number TO number}'] }
			]
		},
		{
			title: 'Operators',
			rules: [
				{ label: 'Conjunction', examples: ['field:phrase AND field:phrase'] },
				{ label: 'Implicit conjunction', examples: ['field:phrase field:phrase'] },
				{ label: 'Disjunction', examples: ['field:phrase OR field:phrase'] },
				{ label: 'Negation', examples: ['NOT field:phrase'] },
				{ label: 'Grouping', examples: ['(field:phrase OR field:phrase) AND field:phrase'] }
			]
		},
		{
			title: 'Case',
			rules: [
				{ label: 'Case-sensitive', examples: ['field:"Phrase"'] },
				{ label: 'Case-insensitive', examples: ['field:phrase'] }
			]
		},
		{
			title: 'Special values',
			rules: [
				{ label: 'Boolean', examples: ['field:true', 'field:false'] },
				{ label: 'Null', examples: ['field:null'] }
			]
		},
		{
			title: 'Wildcards & regex',
			rules: [
				{ label: 'Trailing wildcard', examples: ['field:phrase*'] },
				{ label: 'Single character', examples: ['field:phr?ase'] },
				{ label: 'Wildcard inside a value', examples: ['field:phr*ase'] },
				{ label: 'Regex', examples: ['field:/^phr.*ase$/'] },
				{ label: 'Regex with flags', examples: ['field:/^phr.*ase$/i'] }
			]
		}
	];
</script>

<Sheet.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Sheet.Trigger
					{...props}
					aria-label="Search documentation"
					class={buttonVariants({ variant: 'outline', size: 'icon' })}
				>
					<BookIcon size={16} />
				</Sheet.Trigger>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Search documentation</Tooltip.Content>
	</Tooltip.Root>

	<Sheet.Content side="right" class="flex w-full min-w-lg flex-col gap-0 sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title class="font-bold">Query Syntax</Sheet.Title>
			<Sheet.Description>
				This query syntax is a Lucene-like query language. Type an expression in the search box to
				filter table rows by field.
			</Sheet.Description>
		</Sheet.Header>
		<div class="min-h-0 flex-1 overflow-y-auto">
			{#each sections as section (section.title)}
				<section class="p-4">
					<h3 class="text-sm font-semibold">{section.title}</h3>
					<dl class="space-y-2">
						{#each section.rules as rule (rule.label)}
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<dt class="text-xs text-muted-foreground">{rule.label}</dt>
								<dd class="flex flex-wrap gap-1">
									{#each rule.examples as example (example)}
										<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
											{example}
										</code>
									{/each}
								</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
		<Sheet.Footer>
			<p class="text-xs text-muted-foreground">
				For advanced usage, see the
				<a
					href="https://github.com/gajus/liqe"
					target="_blank"
					rel="noopener noreferrer"
					class="underline">documentation</a
				>.
			</p>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
