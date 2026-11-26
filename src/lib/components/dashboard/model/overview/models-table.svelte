<script lang="ts">
	import { Meter, NUM, Status, TONE_TEXT, type WidgetState } from '$lib/components/dashboard/kit';
	import Sparkline from '$lib/components/dashboard/kit/sparkline.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { STATE_LABEL } from './lib/labels';
	import {
		fmtCount,
		fmtMillis,
		fmtPercent,
		fmtRate,
		fmtReplicas,
		fmtSeconds,
		kvTone,
		type ModelRow,
		modelStatus,
		TABLE_ROWS
	} from './lib/models';

	// One row per model, worst first; the first ten, then "Show all". The name opens the model in
	// Analytics; the row only tints on hover. Too narrow a card scrolls the table sideways inside it.
	let {
		rows,
		sparks,
		state: view,
		emptyHref,
		notice,
		subtitle,
		onopen
	}: {
		/** The line under a model's name; none when it would repeat on every row. */
		subtitle?: (row: ModelRow) => string | undefined;
		/** An error line above the rows when one of the two sources failed. */
		notice?: string;
		/** Already sorted. */
		rows: ModelRow[];
		/** Requests per second over the last hour, by model key. */
		sparks: Map<string, number[]>;
		state: WidgetState;
		/** Where to deploy a model, for the empty state. */
		emptyHref: string;
		onopen: (row: ModelRow) => void;
	} = $props();

	let showAll = $state(false);
	const shown = $derived(showAll ? rows : rows.slice(0, TABLE_ROWS));

	// The vendored table at this card's density: 32px header, 52px rows, cells that may wrap.
	const tableRow = 'h-[3.25rem] hover:bg-muted/60';
	const head = 'h-[2.0625rem] font-normal text-muted-foreground';
	const plain = 'py-0 whitespace-normal';
	const numCell = cn(plain, 'text-right', NUM);
</script>

<Card.Root
	class="@container/panel gap-0 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:px-5 @md:py-[1.125rem]"
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<Card.Title class="text-sm leading-5 font-[550]">{m.models()}</Card.Title>
		<p class="text-xs leading-4 text-muted-foreground">{m.model_overview_models_note()}</p>
	</div>

	{#if view === 'empty'}
		<div class="flex min-h-48 flex-col items-center justify-center gap-1 pt-3 text-center">
			<p class="text-sm font-medium">{m.model_overview_no_models()}</p>
			<p class="text-xs text-muted-foreground">
				{m.model_overview_no_models_hint()}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built with resolve() by the caller -->
				<a href={emptyHref} class="font-medium text-foreground underline underline-offset-3"
					>{m.model_overview_ai_studio_model()}</a
				>
			</p>
		</div>
	{:else if view === 'error'}
		<p class="flex min-h-48 items-center justify-center pt-3 text-sm text-muted-foreground">
			{m.dashboard_couldnt_load()}
		</p>
	{:else}
		{#if notice && view === 'ready'}
			<p class="mt-2" role="status">
				<Status tone="bad" icon="x" class="whitespace-normal">{notice}</Status>
			</p>
		{/if}
		<!-- The table scrolls sideways inside the card; its 4px margin keeps a focus ring whole. -->
		<div class="-mx-1 mt-2">
			<Table.Root
				class="mx-1 w-[calc(100%-0.5rem)] min-w-[1080px] table-fixed border-collapse text-[0.8125rem]"
			>
				<colgroup>
					<col />
					<col class="w-[150px]" />
					<col class="w-[76px]" />
					<col class="w-[86px]" />
					<col class="w-[80px]" />
					<col class="w-[80px]" />
					<col class="w-[76px]" />
					<col class="w-[136px]" />
					<col class="w-[72px]" />
					<col class="w-[108px]" />
				</colgroup>
				<Table.Header class="text-xs">
					<Table.Row class="hover:bg-transparent">
						<Table.Head class={cn(head, 'pl-0 whitespace-normal')}>
							{m.model_overview_col_model()}
						</Table.Head>
						<Table.Head class={cn(head, 'whitespace-normal')}>
							{m.model_overview_col_status()}
						</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_rps()}</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_gen()}</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_ttft()}</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_tpot()}</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_e2e()}</Table.Head>
						<Table.Head class={cn(head, 'whitespace-normal')}>
							{m.model_overview_col_kv()}
						</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>
							{m.model_overview_col_waiting()}
						</Table.Head>
						<Table.Head class={cn(head, 'text-right')}>{m.model_overview_col_spark()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if view === 'loading'}
						{#each [0, 1, 2, 3] as i (i)}
							<Table.Row class="h-[3.25rem] hover:bg-transparent">
								<Table.Cell class={cn(plain, 'pl-0')}><Skeleton class="h-3.5 w-40" /></Table.Cell>
								<Table.Cell class={plain}><Skeleton class="h-3.5 w-24" /></Table.Cell>
								{#each [0, 1, 2, 3, 4] as j (j)}
									<Table.Cell class={plain}><Skeleton class="ml-auto h-3.5 w-10" /></Table.Cell>
								{/each}
								<Table.Cell class={plain}><Skeleton class="h-1.5 w-full" /></Table.Cell>
								<Table.Cell class={plain}><Skeleton class="ml-auto h-3.5 w-6" /></Table.Cell>
								<Table.Cell class={cn(plain, 'pr-0')}><Skeleton class="h-5 w-full" /></Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						{#each shown as row (row.key)}
							{@const sub = subtitle?.(row)}
							{@const status = modelStatus(row)}
							{@const kv = kvTone(row.kv)}
							<Table.Row class={tableRow}>
								<Table.Cell class={cn(plain, 'min-w-0 py-1.5 pl-0')}>
									<!-- A link in the row's own type: the button's height, weight and colour are
									     put back to the text's. -->
									<Button
										variant="link"
										class="block h-auto max-w-full truncate rounded-sm border-0 px-0 py-0.5 text-left font-mono text-[0.8125rem] font-normal text-foreground underline decoration-border underline-offset-3 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-0"
										aria-label={m.model_overview_open_in_analytics({ model: row.name })}
										onclick={() => onopen(row)}
									>
										{row.name}
									</Button>
									{#if sub}
										<p class="truncate text-xs leading-4 text-muted-foreground">{sub}</p>
									{/if}
								</Table.Cell>
								<Table.Cell class={plain}>
									<Status tone={status.tone} variant="dot" class="text-[0.78rem] font-medium">
										{STATE_LABEL[status.state]()} · {fmtReplicas(row)}
									</Status>
								</Table.Cell>
								<Table.Cell class={numCell}>{fmtRate(row.rps)}</Table.Cell>
								<Table.Cell class={numCell}>{fmtRate(row.gen)}</Table.Cell>
								<Table.Cell class={numCell}>{fmtSeconds(row.ttft)}</Table.Cell>
								<Table.Cell class={numCell}>{fmtMillis(row.tpot)}</Table.Cell>
								<Table.Cell class={numCell}>{fmtSeconds(row.e2e)}</Table.Cell>
								<Table.Cell class={plain}>
									<span class="flex items-center gap-2">
										<Meter value={row.kv} class={kv ? TONE_TEXT[kv] : 'text-foreground'} />
										<span
											class={cn(
												'w-9 shrink-0 text-right',
												NUM,
												kv ? TONE_TEXT[kv] : row.kv === undefined && 'text-muted-foreground'
											)}
										>
											{fmtPercent(row.kv)}
										</span>
									</span>
								</Table.Cell>
								<Table.Cell class={cn(numCell, (row.waiting ?? 0) > 0 && TONE_TEXT.warn)}>
									{fmtCount(row.waiting)}
								</Table.Cell>
								<Table.Cell class={cn(plain, 'pr-0')}>
									<Sparkline values={sparks.get(row.key) ?? []} class="h-6" />
								</Table.Cell>
							</Table.Row>
						{/each}
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
		{#if view === 'ready' && rows.length > TABLE_ROWS}
			<div class="flex justify-center pt-2">
				<Button variant="ghost" size="sm" onclick={() => (showAll = !showAll)}>
					{showAll
						? m.model_overview_show_fewer()
						: m.model_overview_show_all({ count: rows.length })}
				</Button>
			</div>
		{/if}
	{/if}
</Card.Root>
