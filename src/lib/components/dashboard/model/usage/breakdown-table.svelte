<script lang="ts">
	import { Chip, NUM } from '$lib/components/dashboard/kit';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import type { DisplayRow } from './lib/display';
	import { fmtGrouped, fmtShare, fmtTokensOrDash } from './lib/format';
	import { failedIsHigh, tokensOf } from './lib/usage';

	// What the selected row is made of: its keys, models or people, each as a share of its tokens.
	let {
		title,
		note,
		rows,
		total
	}: {
		title: string;
		/** Small print right of the title. */
		note?: string;
		rows: DisplayRow[];
		/** The selection's tokens, which Share divides by. */
		total: number;
	} = $props();

	const num = cn('text-right', NUM);
</script>

<section class="rounded-2xl bg-card p-4 shadow-(--card-frame) @md:px-5 @md:py-4.5">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h3 class="text-sm leading-5 font-[550]">{title}</h3>
		{#if note}<p class="text-xs leading-4 text-muted-foreground">{note}</p>{/if}
	</div>
	<!-- The table's container scrolls sideways inside the card on a phone rather than
	     squeezing the columns. -->
	<div class="mt-2">
		<Table.Root class="min-w-[44rem] text-[0.8125rem]">
			<Table.Header>
				<Table.Row class="text-xs hover:bg-transparent">
					<Table.Head class="h-8 pl-0 text-xs font-normal text-muted-foreground">
						{m.usage_name()}
					</Table.Head>
					{#each [m.usage_share(), m.usage_requests(), m.usage_input(), m.usage_cached_input(), m.usage_output(), m.usage_reasoning(), m.usage_failed()] as head, i (i)}
						<Table.Head
							class={cn(
								'h-8 text-right text-xs font-normal text-muted-foreground',
								i === 6 && 'pr-0'
							)}
						>
							{head}
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as item (item.id)}
					{@const t = item.row.totals}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell class="h-11 max-w-[18rem] pl-0">
							<span class="flex min-w-0 items-center gap-2" title={item.title ?? item.label}>
								<span class={cn('truncate', item.mono ? 'font-mono' : 'font-medium')}>
									{item.label}
								</span>
								{#each item.chips as chip (chip)}
									<Chip>{chip}</Chip>
								{/each}
								{#if item.aside}
									<span class="shrink-0 text-xs text-muted-foreground">{item.aside}</span>
								{:else if item.row.view === 'model' && item.sub}
									<span class="shrink-0 text-xs text-muted-foreground">{item.sub}</span>
								{/if}
							</span>
						</Table.Cell>
						<Table.Cell class={num}>{fmtShare(tokensOf(t), total)}</Table.Cell>
						<Table.Cell class={num}>{fmtGrouped(t.requests)}</Table.Cell>
						<Table.Cell class={num}>{fmtTokensOrDash(t.input)}</Table.Cell>
						<Table.Cell class={num}>{fmtTokensOrDash(t.cached)}</Table.Cell>
						<Table.Cell class={num}>{fmtTokensOrDash(t.output)}</Table.Cell>
						<Table.Cell class={num}>{fmtTokensOrDash(t.reasoning)}</Table.Cell>
						<Table.Cell
							class={cn(num, 'pr-0', failedIsHigh(t) ? 'text-chart-1' : 'text-muted-foreground')}
						>
							{fmtGrouped(t.failed)}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</section>
