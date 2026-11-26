<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy } from 'svelte';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		formatSpan,
		rangeFromParams,
		RangePicker,
		rangeToParams,
		resolveRange,
		type TimeRange,
		toNow
	} from '$lib/components/custom/range-picker';
	import { AutoRefresh, RefreshControl, reloadNow } from '$lib/components/custom/reloader';
	import { formatDuration } from '$lib/components/dashboard/kit/format';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';
	import { clusterPrometheusDriver } from '$lib/prometheus';

	import { Dashboard as AnalyticsDashboard } from './analytics/index';
	import ClusterFacts from './overview/cluster-facts.svelte';
	import Overview from './overview/overview.svelte';
	import { ClusterSignals } from './overview/signals.svelte';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);
	// Made while the component is created, on the server too: it only holds where to ask, and asks
	// nothing until a card loads in the browser. The server then sends the cards' own loading state,
	// so the page does not change between that first paint and the browser taking over.
	function createDriver(): PrometheusDriver | null {
		if (!cluster) return null;
		try {
			return clusterPrometheusDriver(cluster);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
			return null;
		}
	}
	const prometheusDriver = createDriver();

	// Analytics state lives in the URL (`?tab=analytics&view=node&mode=history&node=…`), so a
	// reload or a shared link opens the same node or namespace in the same mode.
	const initial = page.url.searchParams;
	const linksAnalytics = ['view', 'mode', 'node', 'namespace'].some((k) => initial.has(k));
	let selectedTab = $state(
		initial.get('tab') === 'analytics' || linksAnalytics ? 'analytics' : 'overview'
	);
	let analyticsView = $state<'node' | 'namespace'>(
		initial.get('view') === 'namespace' ? 'namespace' : 'node'
	);
	let analyticsMode = $state<'now' | 'history'>(
		initial.get('mode') === 'history' ? 'history' : 'now'
	);
	// Kubernetes node name and namespace picked in the rankings; kept while switching view or mode.
	let selectedNode = $state<string | undefined>(initial.get('node') ?? undefined);
	let selectedNamespace = $state<string | undefined>(initial.get('namespace') ?? undefined);

	// replaceState throws until the router has started; afterNavigate runs once it has.
	let routerReady = $state(false);
	afterNavigate(() => (routerReady = true));
	$effect(() => {
		if (!routerReady) return;
		const url = new URL(page.url);
		for (const key of ['tab', 'view', 'mode', 'node', 'namespace', 'range', 'from', 'to']) {
			url.searchParams.delete(key);
		}
		if (selectedTab === 'analytics') {
			url.searchParams.set('tab', 'analytics');
			url.searchParams.set('view', analyticsView);
			if (analyticsMode === 'history') {
				url.searchParams.set('mode', 'history');
				for (const [k, v] of Object.entries(rangeToParams(historyRange)))
					url.searchParams.set(k, v);
			}
			if (analyticsView === 'node' && selectedNode) url.searchParams.set('node', selectedNode);
			if (analyticsView === 'namespace' && selectedNamespace) {
				url.searchParams.set('namespace', selectedNamespace);
			}
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, only the query changes
		if (url.search !== page.url.search) replaceState(url, page.state);
	});

	// History's window. A quick range ends at `anchor`, which moves to now when History is entered
	// or the range is picked or refreshed; a fixed range stays where it was set.
	let historyRange = $state<TimeRange>(rangeFromParams(initial));
	let anchor = $state(Date.now());
	const resolved = $derived(resolveRange(historyRange, anchor));
	const start = $derived(new Date(resolved.start));
	const end = $derived(new Date(resolved.end));
	const windowLabel = $derived(
		historyRange.kind === 'relative'
			? m.analytics_window_last({ duration: formatDuration(historyRange.minutes * 60) })
			: formatSpan(resolved.start, resolved.end)
	);

	function setMode(mode: 'now' | 'history') {
		if (mode === 'history' && historyRange.kind === 'relative') anchor = Date.now();
		analyticsMode = mode;
	}

	// Now mode: auto update bumps `tick` every 10 s and every Now card refetches on it.
	const clock = new AutoRefresh();
	const nowMode = $derived(selectedTab === 'analytics' && analyticsMode === 'now');
	$effect(() => {
		if (nowMode) return clock.run(isReloading);
	});
	const inHistory = $derived(selectedTab === 'analytics' && analyticsMode === 'history');

	// ↻: the overview's cards and the header's signals fetch once (auto update stays as it was),
	// Now cards refetch on `tick`, and History moves its window to now.
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

	// Node readiness, roles and firing alerts, shared by the header and the overview's cards.
	const signals = $derived(prometheusDriver ? new ClusterSignals(prometheusDriver) : null);
	$effect(() => {
		const current = signals;
		if (!current) return;
		current.setReloading(isReloading);
		return () => current.stop();
	});

	const TAB_LIST = 'rounded-full';
	const TAB_TRIGGER = 'rounded-full px-3 data-active:bg-card dark:data-active:bg-card';

	onDestroy(() => {
		isReloading = false;
	});
</script>

<!-- `@container`: every layout below follows this element's width, not the viewport's. -->
<div class="@container pb-8">
	<header>
		<h1 class="text-3xl leading-9 font-[350] tracking-tight">{m.cluster_status()}</h1>
		<!-- Wraps between facts, never inside one; a fact too long for the line truncates. -->
		<p
			class="mt-0.5 flex min-h-5 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-muted-foreground"
		>
			<span class="flex max-w-full min-w-0 items-baseline gap-1.5">
				<span class="shrink-0">{m.cluster()}</span>
				<span class="min-w-0 truncate font-mono text-[0.8125rem] text-foreground" title={cluster}>
					{cluster}
				</span>
			</span>
			{#if signals}
				<ClusterFacts {signals} />
			{/if}
		</p>
	</header>
	{#if prometheusDriver && signals}
		<div class="mt-4 w-full">
			<Tabs.Root bind:value={selectedTab}>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<Tabs.List class={TAB_LIST}>
						<Tabs.Trigger value="overview" class={TAB_TRIGGER}>{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" class={TAB_TRIGGER}>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<div
							class="flex-wrap items-center justify-end gap-2 {selectedTab !== 'analytics'
								? 'pointer-events-none hidden select-none **:transition-none @5xl:invisible @5xl:flex'
								: 'flex'}"
							aria-hidden={selectedTab !== 'analytics'}
						>
							<!-- History's window sits first, so it never pushes the switches aside; where
							     the row has no room for it (under 66rem), it takes a row of its own below.
							     Only the refresh control's own width still changes between the modes. -->
							{#if analyticsMode === 'history'}
								<div class="hidden @[66rem]:flex">
									<RangePicker bind:range={historyRange} bind:anchor />
								</div>
							{/if}
							<Tabs.Root bind:value={analyticsView}>
								<Tabs.List class={TAB_LIST}>
									<Tabs.Trigger value="node" class={TAB_TRIGGER}>{m.node()}</Tabs.Trigger>
									<Tabs.Trigger value="namespace" class={TAB_TRIGGER}>{m.namespace()}</Tabs.Trigger>
								</Tabs.List>
							</Tabs.Root>
							<Tabs.Root
								value={analyticsMode}
								onValueChange={(v) => setMode(v === 'history' ? 'history' : 'now')}
							>
								<Tabs.List class={TAB_LIST}>
									<Tabs.Trigger value="now" class={TAB_TRIGGER}>{m.analytics_now()}</Tabs.Trigger>
									<Tabs.Trigger value="history" class={TAB_TRIGGER}
										>{m.analytics_history()}</Tabs.Trigger
									>
								</Tabs.List>
							</Tabs.Root>
						</div>
						{#if inHistory}
							<!-- History only updates on demand: ↻ moves its window to now. -->
							<RefreshControl
								updatedAt={historyRange.kind === 'relative' ? anchor : undefined}
								past={historyRange.kind !== 'relative'}
								onrefresh={refresh}
								onnow={historyToNow}
							/>
						{:else}
							<RefreshControl
								bind:live={isReloading}
								updatedAt={nowMode ? clock.updatedAt : signals.updatedAt}
								onrefresh={refresh}
							/>
						{/if}
					</div>
				</div>
				{#if inHistory}
					<div class="mt-2 flex justify-end @[66rem]:hidden">
						<RangePicker bind:range={historyRange} bind:anchor />
					</div>
				{/if}
				<Tabs.Content value="overview" class="pt-3">
					<Overview {prometheusDriver} {signals} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics" class="pt-3">
					<AnalyticsDashboard
						client={prometheusDriver}
						view={analyticsView}
						history={analyticsMode === 'history'}
						bind:selectedNode
						bind:selectedNamespace
						{start}
						{end}
						{windowLabel}
						tick={clock.tick}
					/>
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</div>
