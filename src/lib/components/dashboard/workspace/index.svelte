<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy } from 'svelte';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		formatSpan,
		RangePicker,
		rangeToParams,
		resolveRange,
		type TimeRange,
		toNow
	} from '$lib/components/custom/range-picker';
	import { AutoRefresh, RefreshControl, reloadNow } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import { TAB_LIST, TAB_TRIGGER } from '$lib/components/dashboard/kit';
	import { formatDuration } from '$lib/components/dashboard/kit/format';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';
	import { dashboardBody, sharedMetrics, workspacePrometheusDriver } from '$lib/prometheus';

	import AnalyticsDashboard from './analytics/index.svelte';
	import { RANK_METRICS, type RankMetric } from './analytics/lib/model';
	import { historyRangeFromParams } from './analytics/lib/url';
	import { workspaceOverviewWidgets } from './overview/widgets';

	let {
		cluster,
		namespace,
		canViewClusterMetrics = false
	}: {
		cluster: string;
		namespace: string;
		canViewClusterMetrics?: boolean;
	} = $props();

	let isReloading = $state(true);

	// Analytics state lives in the URL (`?tab=analytics&metric=gpu&sel=qwen&mode=history&range=1440`),
	// so a reload or a shared link opens the same workload in the same mode.
	const initial = page.url.searchParams;
	const linksAnalytics = ['metric', 'sel', 'mode'].some((key) => initial.has(key));
	let selectedTab = $state(
		initial.get('tab') === 'analytics' || linksAnalytics ? 'analytics' : 'overview'
	);
	let analyticsMode = $state<'now' | 'history'>(
		initial.get('mode') === 'history' ? 'history' : 'now'
	);
	const initialMetric = initial.get('metric') as RankMetric;
	let rankMetric = $state<RankMetric>(RANK_METRICS.includes(initialMetric) ? initialMetric : 'cpu');
	// The ranking row the detail shows; undefined is the whole workspace.
	let selectedRow = $state<string | undefined>(initial.get('sel') ?? undefined);

	// History's window, the last 24 hours unless the link says otherwise. A quick range ends at
	// `anchor`, which moves to now when History is entered or the range is picked or refreshed.
	let historyRange = $state<TimeRange>(historyRangeFromParams(initial));
	let anchor = $state(Date.now());
	const resolved = $derived(resolveRange(historyRange, anchor));
	const start = $derived(new Date(resolved.start));
	const end = $derived(new Date(resolved.end));
	const windowLabel = $derived(
		historyRange.kind === 'relative'
			? m.analytics_window_last({ duration: formatDuration(historyRange.minutes * 60) })
			: formatSpan(resolved.start, resolved.end)
	);

	// replaceState throws until the router has started; afterNavigate runs once it has.
	let routerReady = $state(false);
	afterNavigate(() => (routerReady = true));
	$effect(() => {
		if (!routerReady) return;
		const url = new URL(page.url);
		for (const key of ['tab', 'metric', 'sel', 'mode', 'range', 'from', 'to']) {
			url.searchParams.delete(key);
		}
		if (selectedTab === 'analytics') {
			url.searchParams.set('tab', 'analytics');
			if (rankMetric !== 'cpu') url.searchParams.set('metric', rankMetric);
			if (selectedRow) url.searchParams.set('sel', selectedRow);
			if (analyticsMode === 'history') {
				url.searchParams.set('mode', 'history');
				for (const [k, v] of Object.entries(rangeToParams(historyRange)))
					url.searchParams.set(k, v);
			}
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, only the query changes
		if (url.search !== page.url.search) replaceState(url, page.state);
	});

	function setMode(mode: 'now' | 'history') {
		if (mode === 'history' && historyRange.kind === 'relative') anchor = Date.now();
		analyticsMode = mode;
	}
	const inHistory = $derived(selectedTab === 'analytics' && analyticsMode === 'history');

	// Every overview card refetches on its own every 10 s while auto update is on; this clock keeps
	// the refresh control's "updated" time in step with them, and Analytics' Now cards refetch on
	// its `tick`. History only updates on demand.
	const clock = new AutoRefresh();
	$effect(() => {
		if (!inHistory) return clock.run(isReloading);
	});
	function refresh() {
		if (inHistory) {
			anchor = Date.now();
			return;
		}
		reloadNow(
			() => isReloading,
			(value) => (isReloading = value)
		);
		clock.mark();
	}
	function historyToNow() {
		historyRange = toNow(historyRange);
		anchor = Date.now();
	}

	// Made while the component is created, on the server too: it only holds where to ask, and asks
	// nothing until a card loads in the browser. The server then sends the cards' own loading state,
	// so the page does not change between that first paint and the browser taking over.
	function createDriver(): PrometheusDriver | null {
		try {
			return workspacePrometheusDriver(cluster, namespace, canViewClusterMetrics);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
			return null;
		}
	}
	const prometheusDriver = createDriver();
	// The driver is made above, in one pass: there is no "not initialized yet" to wait for.
	const body = $derived(
		dashboardBody({
			hasDriver: prometheusDriver !== null,
			initialized: true,
			cluster,
			namespace: namespace
		})
	);

	// GPU and Ceph numbers come from the server's named queries, not PromQL of the card's own.
	const shared = $derived(sharedMetrics(cluster, namespace));
	const widgets = $derived(
		workspaceOverviewWidgets.map((w) => ({
			...w,
			props:
				w.key === 'storage' || w.key === 'resource-quota' ? { namespace, shared } : { namespace }
		}))
	);

	onDestroy(() => {
		isReloading = false;
	});
</script>

<!-- `@container`: the grid follows the width of the content area, which the sidebar changes
     by 200px, not the viewport. -->
<div class="@container flex flex-col gap-4 pb-6">
	<div class="min-w-0">
		<h1 class="text-3xl leading-9 font-[350] tracking-tight">{m.workspace_dashboard_title()}</h1>
		<!-- Which namespace the numbers are for; the cards explain themselves. -->
		<p class="mt-0.5 flex min-h-5 items-baseline gap-2 text-sm text-muted-foreground">
			{#if namespace}
				{m.namespace()}
				<span class="truncate font-mono text-[0.8125rem] text-foreground" title={namespace}>
					{namespace}
				</span>
			{/if}
		</p>
	</div>
	{#if prometheusDriver}
		<Tabs.Root bind:value={selectedTab} class="gap-0">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<Tabs.List class={TAB_LIST}>
						<Tabs.Trigger value="overview" class={TAB_TRIGGER}>{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" class={TAB_TRIGGER}>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					{#if selectedTab === 'analytics'}
						<Tabs.Root
							value={analyticsMode}
							onValueChange={(v) => setMode(v === 'history' ? 'history' : 'now')}
						>
							<Tabs.List class={TAB_LIST}>
								<Tabs.Trigger value="now" class={TAB_TRIGGER}>{m.analytics_now()}</Tabs.Trigger>
								<Tabs.Trigger value="history" class={TAB_TRIGGER}>
									{m.analytics_history()}
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
					{/if}
				</div>
				<!-- The overview has no time range: every card there is a reading of "now". History's
				     charts use one, and only update on demand: ↻ moves the window to now. -->
				<div class="flex flex-wrap items-center justify-end gap-2">
					{#if inHistory}
						<RangePicker bind:range={historyRange} bind:anchor />
						<RefreshControl
							updatedAt={historyRange.kind === 'relative' ? anchor : undefined}
							past={historyRange.kind !== 'relative'}
							onrefresh={refresh}
							onnow={historyToNow}
						/>
					{:else}
						<RefreshControl
							bind:live={isReloading}
							updatedAt={clock.updatedAt}
							onrefresh={refresh}
						/>
					{/if}
				</div>
			</div>
			<!-- The tabs keep both panels mounted, so each one's cards are only there while its tab is
			     open: hidden cards would go on asking every 10 s. -->
			<Tabs.Content value="overview" class="grid grid-cols-12 gap-2 pt-3 @md:gap-3">
				{#if selectedTab === 'overview'}
					<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
				{/if}
			</Tabs.Content>
			<Tabs.Content value="analytics" class="pt-3">
				{#if selectedTab === 'analytics'}
					<AnalyticsDashboard
						client={prometheusDriver}
						{shared}
						{cluster}
						{namespace}
						history={analyticsMode === 'history'}
						bind:metric={rankMetric}
						bind:selected={selectedRow}
						{start}
						{end}
						{windowLabel}
						tick={clock.tick}
					/>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	{:else if body === 'no-namespace'}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.workspace_namespace_unknown()}</p>
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</div>
