<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onMount, untrack } from 'svelte';

	import { Chip, Loader, NUM, type WidgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { cn } from '$lib/utils';

	import BreakdownTable from './breakdown-table.svelte';
	import EmptyCard from './empty-card.svelte';
	import HourlyChart, { type BarPoint, type BarSeries, SOFT_FILL } from './hourly-chart.svelte';
	import { loadDirectory } from './lib/directory';
	import { displayRow, kindLabel, viewLabel, workspaceName } from './lib/display';
	import { DASH, fmtDay, fmtGrouped, fmtPercentOf, fmtTokens, fmtTokensOrDash } from './lib/format';
	import type { UsageParams } from './lib/params';
	import {
		bucketSeconds,
		fetchCollected,
		fetchFacts,
		fetchSeries,
		makeBuckets,
		scopeMatchers
	} from './lib/queries';
	import {
		BREAKDOWNS,
		bucketTotals,
		buildRows,
		type Directory,
		failedIsHigh,
		filterFacts,
		type SeriesFact,
		sortRows,
		splitTenant,
		summarize,
		tokensOf,
		type UsageFact,
		type View
	} from './lib/usage';
	import StatStrip from './stat-strip.svelte';
	import UsageRanking from './usage-ranking.svelte';

	// AI Gateway usage: requests and tokens made with API keys, by person, key, Workspace and
	// model. Only gateway metrics: no latency, no cache hit rate, no vLLM numbers.
	let {
		client,
		cluster,
		params = $bindable(),
		start,
		end,
		clusterScope,
		everywhere,
		currentWorkspace,
		defaultNamespace,
		manageKeysHref,
		windowMinutes,
		onLongerRange,
		onfetching
	}: {
		client: PrometheusDriver;
		cluster: string;
		/** URL state, shared with the controls above; this component changes view, sort and selection. */
		params: UsageParams;
		start: number;
		end: number;
		/** The driver answers at cluster scope, so a Workspace filter goes into the PromQL. */
		clusterScope: boolean;
		/** A cluster admin: every Workspace, the Workspaces view and filter. */
		everywhere: boolean;
		currentWorkspace: string;
		defaultNamespace: string;
		manageKeysHref: string;
		/** The window's length, for the empty state's title; absent for a fixed window. */
		windowMinutes?: number;
		onLongerRange?: () => void;
		/** A fetch starts (true) or has finished (false), for the refresh control. */
		onfetching?: (busy: boolean) => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const locale = getLocale();

	// The namespace whose usage is shown; '' is all of them, an admin's choice only.
	const namespace = $derived(everywhere ? params.namespace : defaultNamespace);
	const matchers = $derived(scopeMatchers(namespace, clusterScope));
	const step = $derived(bucketSeconds(end - start));
	const buckets = $derived(makeBuckets(start, end, step));

	// ApiKeys and Workspaces, read once.
	let dir = $state.raw<Directory | undefined>(undefined);
	onMount(() => {
		loadDirectory(createClient(ResourceService, transport), {
			cluster,
			everywhere,
			workspace: currentWorkspace,
			namespace: defaultNamespace
		}).then((d) => (dir = d));
	});
	const directory = $derived<Directory>(
		dir ?? { keys: new Map(), workspaces: new Map(), people: new Map() }
	);

	// Prometheus: totals for the window, per-bucket series, and (cluster scope) whether the
	// gateway is scraped at all. Each part fails on its own. No auto update: a new window or the
	// refresh control's ↻ (which moves the window's end) fetches again.
	const totals = new Loader<UsageFact[]>(() => fetchFacts(client, matchers, start, end));
	const perBucket = new Loader<SeriesFact[]>(() => fetchSeries(client, matchers, buckets, step));
	// A probe that fails answers "unknown", which reads as collected.
	const probe = new Loader<{ collected: boolean | undefined }>(() =>
		fetchCollected(client).then(
			(collected) => ({ collected }),
			() => ({ collected: undefined })
		)
	);
	// Which fetch is the newest, so an older one finishing late does not end "updating".
	let run = 0;
	$effect(() => {
		void [matchers, start, end, step, buckets];
		const probing = clusterScope;
		untrack(() => {
			const id = ++run;
			totals.reset();
			perBucket.reset();
			onfetching?.(true);
			void Promise.all([totals.load(), perBucket.load()]).then(() => {
				if (id === run) onfetching?.(false);
			});
			if (probing) void probe.load();
		});
	});
	const facts = $derived(totals.data ?? []);
	const factsState = $derived<WidgetState>(totals.state);
	const series = $derived(perBucket.data ?? []);
	const seriesState = $derived<WidgetState>(perBucket.state);
	const collected = $derived(probe.data?.collected);

	const summary = $derived(summarize(facts, directory, namespace));
	const nothing = $derived(factsState === 'ready' && summary.keysUsed === 0);
	const emptyKind = $derived(
		nothing ? (clusterScope && collected === false ? 'not-collected' : 'no-requests') : undefined
	);

	// Views: Users needs the ApiKeys; Workspaces is an admin's looking at all of them.
	const keysUnreadable = $derived(dir !== undefined && dir.keys === null);
	const views = $derived<View[]>(
		[
			keysUnreadable ? undefined : ('user' as const),
			'key' as const,
			everywhere && !namespace ? ('workspace' as const) : undefined,
			'model' as const
		].filter((v): v is View => v !== undefined)
	);
	const view = $derived<View>(views.includes(params.view) ? params.view : views[0]);

	// Each view remembers what was last picked in it; the URL only carries the current one.
	const remembered: Partial<Record<View, string>> = {};
	function setView(next: View) {
		remembered[view] = params.selected;
		params.view = next;
		params.selected = remembered[next];
	}

	const rankState = $derived<WidgetState>(
		factsState === 'ready' && dir === undefined ? 'loading' : factsState
	);
	const rows = $derived(
		sortRows(buildRows(view, facts, series, directory, buckets.length), params.sort).map((r) =>
			displayRow(r, directory, locale)
		)
	);
	const selectedId = $derived(
		rows.some((r) => r.id === params.selected) ? params.selected : rows[0]?.id
	);
	const selected = $derived(rows.find((r) => r.id === selectedId));

	const selFacts = $derived(selectedId ? filterFacts(facts, view, selectedId, directory) : []);
	const selSeries = $derived(selectedId ? filterFacts(series, view, selectedId, directory) : []);
	const breakdowns = $derived(
		BREAKDOWNS[view]
			.filter((by) => !(by === 'user' && keysUnreadable))
			.map((by) => ({
				by,
				rows: sortRows(buildRows(by, selFacts, [], directory), 'tokens').map((r) =>
					displayRow(r, directory, locale)
				)
			}))
	);

	// Bars are labelled by where their bucket starts.
	function chartData(source: SeriesFact[]) {
		const totals = bucketTotals(source, buckets.length);
		const tokens: BarPoint[] = [];
		const requests: BarPoint[] = [];
		buckets.forEach((b, i) => {
			const date = new Date(b.start);
			const until = new Date(b.end);
			tokens.push({ date, end: until, input: totals.input[i], output: totals.output[i] });
			requests.push({
				date,
				end: until,
				succeeded: Math.max(0, totals.requests[i] - totals.failed[i]),
				failed: totals.failed[i]
			});
		});
		return { tokens, requests };
	}
	const allCharts = $derived(chartData(series));
	const selCharts = $derived(chartData(selSeries));

	const titles = $derived(
		step >= 86_400
			? { tokens: m.usage_tokens_per_day(), requests: m.usage_requests_per_day() }
			: step >= 3600
				? { tokens: m.usage_tokens_per_hour(), requests: m.usage_requests_per_hour() }
				: { tokens: m.usage_tokens_per_5m(), requests: m.usage_requests_per_5m() }
	);
	const TOKEN_SERIES = $derived<[BarSeries, BarSeries]>([
		{ key: 'input', label: m.usage_input(), color: 'var(--chart-3)' },
		{ key: 'output', label: m.usage_output(), color: SOFT_FILL }
	]);
	const REQUEST_SERIES = $derived<[BarSeries, BarSeries]>([
		{ key: 'succeeded', label: m.usage_succeeded(), color: 'var(--chart-3)' },
		{ key: 'failed', label: m.usage_failed(), color: 'var(--destructive)' }
	]);

	const summaryItems = $derived.by(() => {
		const t = summary.totals;
		const fifth =
			everywhere && !namespace
				? {
						label: m.usage_workspaces(),
						value: fmtGrouped(summary.workspaces),
						note: m.usage_workspaces_note()
					}
				: {
						label: m.usage_models_used(),
						value: fmtGrouped(summary.models),
						note: m.usage_models_note({ workspace: workspaceName(directory, namespace) })
					};
		return [
			{
				label: m.usage_requests(),
				value: fmtGrouped(t.requests),
				note:
					t.requests > 0
						? m.usage_failed_note({
								count: fmtGrouped(t.failed),
								percent: fmtPercentOf(t.failed, t.requests)
							})
						: m.usage_no_requests(),
				noteClass: failedIsHigh(t) ? 'text-chart-1' : undefined
			},
			{
				label: m.usage_input_tokens(),
				value: fmtTokens(t.input),
				note: m.usage_cached_note({ count: fmtTokens(t.cached) })
			},
			{
				label: m.usage_output_tokens(),
				value: fmtTokens(t.output),
				note: m.usage_reasoning_note({ count: fmtTokens(t.reasoning) })
			},
			{
				label: m.usage_api_keys_used(),
				value: fmtGrouped(summary.keysUsed),
				note:
					summary.keysTotal === null
						? usersLabel(summary.users)
						: m.usage_keys_note({
								total: fmtGrouped(summary.keysTotal),
								users: usersLabel(summary.users)
							})
			},
			fifth
		];
	});

	const selTotals = $derived(selected?.row.totals);
	const detailItems = $derived(
		selTotals
			? [
					{ label: m.usage_requests(), value: fmtGrouped(selTotals.requests) },
					{ label: m.usage_input_tokens(), value: fmtTokensOrDash(selTotals.input) },
					{ label: m.usage_cached_input(), value: fmtTokensOrDash(selTotals.cached) },
					{ label: m.usage_output_tokens(), value: fmtTokensOrDash(selTotals.output) },
					{ label: m.usage_reasoning(), value: fmtTokensOrDash(selTotals.reasoning) },
					{
						label: m.usage_failed(),
						value: selTotals.failed > 0 ? fmtGrouped(selTotals.failed) : DASH
					}
				]
			: []
	);

	const keyInfo = $derived.by(() => {
		if (view !== 'key' || !selected) return undefined;
		const { namespace: ns } = splitTenant(selected.id);
		const r = selected.row;
		return [
			{ label: m.usage_owner(), value: r.owner?.name || m.usage_owner_unknown(), mono: false },
			{ label: m.usage_workspace(), value: workspaceName(directory, ns), mono: false },
			{ label: m.usage_created(), value: fmtDay(r.created, locale), mono: false },
			{ label: m.usage_client_id(), value: selected.id, mono: true }
		];
	});

	const emptyTitle = $derived(
		emptyKind === 'not-collected'
			? m.usage_not_collected_title()
			: windowMinutes
				? m.usage_empty_title_last({ span: spanLabel(windowMinutes) })
				: m.usage_empty_title_range()
	);
	function usersLabel(n: number): string {
		return n === 1 ? m.usage_user_count_one() : m.usage_user_count({ count: fmtGrouped(n) });
	}
	function spanLabel(min: number): string {
		if (min <= 48 * 60 && min % 60 === 0) {
			return min === 60
				? m.time_range_span_one_hour()
				: m.time_range_span_hours({ count: String(min / 60) });
		}
		if (min % 1440 === 0) {
			return min === 1440
				? m.time_range_span_one_day()
				: m.time_range_span_days({ count: String(min / 1440) });
		}
		return m.time_range_span_minutes({ count: String(min) });
	}
</script>

<!-- Tokens and requests per bucket, for everything in view and again for the selected row. -->
{#snippet charts(data: { tokens: BarPoint[]; requests: BarPoint[] })}
	<div class="grid gap-3 @4xl:grid-cols-5">
		<div class="min-w-0 @4xl:col-span-3">
			<HourlyChart
				title={titles.tokens}
				tooltip={m.usage_note_tokens()}
				data={data.tokens}
				series={TOKEN_SERIES}
				format={fmtTokens}
				state={seriesState}
				bucketSeconds={step}
			/>
		</div>
		<div class="min-w-0 @4xl:col-span-2">
			<HourlyChart
				title={titles.requests}
				data={data.requests}
				series={REQUEST_SERIES}
				format={fmtGrouped}
				state={seriesState}
				bucketSeconds={step}
			/>
		</div>
	</div>
{/snippet}

<!-- `@container`: the layout follows this element's width, not the viewport's. -->
<div class="@container flex flex-col gap-3 pb-8">
	<StatStrip items={summaryItems} state={factsState} label={m.usage()} />

	{#if emptyKind}
		<EmptyCard
			kind={emptyKind}
			title={emptyTitle}
			manageHref={manageKeysHref}
			onLonger={onLongerRange}
		/>
	{:else}
		{@render charts(allCharts)}

		<UsageRanking
			{views}
			bind:view={() => view, (v) => setView(v)}
			bind:sort={params.sort}
			{rows}
			state={rankState}
			selected={selectedId}
			onSelect={(id) => (params.selected = id)}
			notice={keysUnreadable ? m.usage_keys_unreadable() : undefined}
		/>

		{#if selected && rankState === 'ready'}
			<section class="flex flex-col gap-3" aria-label={kindLabel(view)}>
				<div class="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
					<span class="text-xs text-muted-foreground">{kindLabel(view)}</span>
					<h2
						class={cn(
							'min-w-0 truncate text-2xl leading-8 tracking-tight',
							selected.mono ? 'font-mono' : 'font-[450]'
						)}
						title={selected.title ?? selected.label}
					>
						{selected.label}
					</h2>
					{#each selected.chips as chip (chip)}
						<Chip>{chip}</Chip>
					{/each}
					<span class="min-w-0 truncate text-sm text-muted-foreground">{selected.sub}</span>
				</div>

				<StatStrip items={detailItems} state="ready" label={kindLabel(view)} compact />

				{#if keyInfo}
					<dl
						class="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-card px-4 py-3.5 shadow-(--card-frame) @md:px-5 @4xl:grid-cols-4"
					>
						{#each keyInfo as item (item.label)}
							<div class="min-w-0">
								<dt class="text-xs leading-4 text-muted-foreground">{item.label}</dt>
								<dd
									class={cn(
										'mt-1 truncate text-sm',
										item.mono && 'font-mono text-[0.8125rem]',
										NUM
									)}
								>
									{item.value}
								</dd>
							</div>
						{/each}
					</dl>
				{/if}

				{@render charts(selCharts)}

				{#each breakdowns as table (table.by)}
					<BreakdownTable
						title={viewLabel(table.by)}
						note={view === 'workspace' && table.by === 'user' ? m.usage_users_matched() : undefined}
						rows={table.rows}
						total={tokensOf(selected.row.totals)}
					/>
				{/each}
			</section>
		{/if}
	{/if}
</div>
