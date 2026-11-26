<script lang="ts">
	import Sparkline from '$lib/components/dashboard/cluster/analytics/sparkline.svelte';
	import { Meter, NUM, Status, type WidgetState } from '$lib/components/dashboard/kit';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import {
		fmtCount,
		fmtMillis,
		fmtPercent,
		fmtRate,
		fmtReplicas,
		fmtSeconds,
		kvTone,
		type ModelRow,
		type ModelState,
		modelStatus,
		TABLE_ROWS,
		type Tone
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

	const stateLabel: Record<ModelState, () => string> = {
		starting: m.model_overview_state_starting,
		queueing: m.model_overview_state_queueing,
		idle: m.model_overview_state_idle,
		serving: m.model_overview_state_serving
	};
	const toneText: Record<Tone, string> = {
		ok: 'text-chart-2',
		warn: 'text-chart-1',
		bad: 'text-destructive',
		muted: 'text-muted-foreground'
	};

	let showAll = $state(false);
	const shown = $derived(showAll ? rows : rows.slice(0, TABLE_ROWS));

	const numCell = cn('px-2 text-right', NUM);
	const head = 'px-2 py-2 text-right font-normal whitespace-nowrap';
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
		<div class="-mx-1 mt-2 overflow-x-auto px-1">
			<table class="w-full min-w-[1080px] table-fixed border-collapse text-[0.8125rem]">
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
				<thead class="text-xs text-muted-foreground">
					<tr class="border-b border-border">
						<th class="py-2 pr-2 text-left font-normal">{m.model_overview_col_model()}</th>
						<th class="px-2 py-2 text-left font-normal">{m.model_overview_col_status()}</th>
						<th class={head}>{m.model_overview_col_rps()}</th>
						<th class={head}>{m.model_overview_col_gen()}</th>
						<th class={head}>{m.model_overview_col_ttft()}</th>
						<th class={head}>{m.model_overview_col_tpot()}</th>
						<th class={head}>{m.model_overview_col_e2e()}</th>
						<th class="px-2 py-2 text-left font-normal">{m.model_overview_col_kv()}</th>
						<th class={head}>{m.model_overview_col_waiting()}</th>
						<th class={head}>{m.model_overview_col_spark()}</th>
					</tr>
				</thead>
				<tbody>
					{#if view === 'loading'}
						{#each [0, 1, 2, 3] as i (i)}
							<tr class="h-[3.25rem] border-b border-border last:border-b-0">
								<td class="pr-2"><Skeleton class="h-3.5 w-40" /></td>
								<td class="px-2"><Skeleton class="h-3.5 w-24" /></td>
								{#each [0, 1, 2, 3, 4] as j (j)}
									<td class="px-2"><Skeleton class="ml-auto h-3.5 w-10" /></td>
								{/each}
								<td class="px-2"><Skeleton class="h-1.5 w-full" /></td>
								<td class="px-2"><Skeleton class="ml-auto h-3.5 w-6" /></td>
								<td class="pl-2"><Skeleton class="h-5 w-full" /></td>
							</tr>
						{/each}
					{:else}
						{#each shown as row (row.key)}
							{@const sub = subtitle?.(row)}
							{@const status = modelStatus(row)}
							{@const kv = kvTone(row.kv)}
							<tr
								class="h-[3.25rem] border-b border-border transition-colors last:border-b-0 hover:bg-muted/60"
							>
								<td class="min-w-0 py-1.5 pr-2">
									<button
										type="button"
										class="block max-w-full truncate py-0.5 text-left font-mono text-[0.8125rem] underline decoration-border underline-offset-3 hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
										aria-label={m.model_overview_open_in_analytics({ model: row.name })}
										onclick={() => onopen(row)}
									>
										{row.name}
									</button>
									{#if sub}
										<p class="truncate text-xs leading-4 text-muted-foreground">{sub}</p>
									{/if}
								</td>
								<td class="px-2">
									<Status tone={status.tone} variant="dot" class="text-[0.78rem] font-medium">
										{stateLabel[status.state]()} · {fmtReplicas(row)}
									</Status>
								</td>
								<td class={numCell}>{fmtRate(row.rps)}</td>
								<td class={numCell}>{fmtRate(row.gen)}</td>
								<td class={numCell}>{fmtSeconds(row.ttft)}</td>
								<td class={numCell}>{fmtMillis(row.tpot)}</td>
								<td class={numCell}>{fmtSeconds(row.e2e)}</td>
								<td class="px-2">
									<span class="flex items-center gap-2">
										<Meter value={row.kv} class={kv ? toneText[kv] : 'text-foreground'} />
										<span
											class={cn(
												'w-9 shrink-0 text-right',
												NUM,
												kv ? toneText[kv] : row.kv === undefined && 'text-muted-foreground'
											)}
										>
											{fmtPercent(row.kv)}
										</span>
									</span>
								</td>
								<td class={cn(numCell, (row.waiting ?? 0) > 0 && 'text-chart-1')}>
									{fmtCount(row.waiting)}
								</td>
								<td class="pl-2">
									<Sparkline values={sparks.get(row.key) ?? []} class="h-6" />
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
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
