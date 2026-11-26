<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { NamespacePicker } from '$lib/components/custom/namespace-picker';
	import {
		DEFAULT_RANGE,
		formatSpan,
		rangeFromParams,
		RangePicker,
		rangeToParams,
		resolveRange,
		type TimeRange,
		toNow
	} from '$lib/components/custom/range-picker';
	import { AutoRefresh, RefreshControl } from '$lib/components/custom/reloader';
	import { formatDuration } from '$lib/components/dashboard/kit/format';
	import { Dashboard } from '$lib/components/dashboard/model/analytics';
	import {
		type RankTab,
		tabFromParam
	} from '$lib/components/dashboard/model/analytics/lib/ranking';
	import { Overview } from '$lib/components/dashboard/model/overview/index';
	import {
		USAGE_PARAM_KEYS,
		usageFromParams,
		usageToParams
	} from '$lib/components/dashboard/model/usage/lib/params';
	import Usage from '$lib/components/dashboard/model/usage/usage.svelte';
	import WorkspaceFilter from '$lib/components/dashboard/model/usage/workspace-filter.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';
	import { dashboardBody, sharedMetrics, workspacePrometheusDriver } from '$lib/prometheus';

	let {
		cluster,
		currentWorkspace = '',
		defaultNamespace = '',
		isClusterAdmin = false,
		canViewClusterMetrics = false
	}: {
		cluster: string;
		/** Name of the currently active workspace (for default picker selection) */
		currentWorkspace?: string;
		/** Workspace namespace used as initial namespace state */
		defaultNamespace?: string;
		isClusterAdmin?: boolean;
		canViewClusterMetrics?: boolean;
	} = $props();

	let isReloading = $state(true);
	// Made while the component is created, on the server too: it only holds where to ask, and asks
	// nothing until a card loads in the browser. The server can then send each tab's own loading
	// cards, so the page does not change between that first paint and the browser taking over.
	function createDriver(): PrometheusDriver | null {
		try {
			return workspacePrometheusDriver(cluster, defaultNamespace, canViewClusterMetrics);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
			return null;
		}
	}
	const prometheusDriver = createDriver();
	// GPU panels ask the shared scope as the Workspace's member, whichever
	// namespace an admin picks for the charts.
	const shared = $derived(sharedMetrics(cluster, defaultNamespace));
	// With no driver there is nothing to wait for: the page says why at once.
	const body = $derived(
		dashboardBody({
			hasDriver: prometheusDriver !== null,
			initialized: true,
			cluster,
			namespace: defaultNamespace
		})
	);
	// The tab is in the URL (`?tab=usage`), and so is Usage's state, so a reload or a shared link
	// opens the same view and selection.
	const initial = page.url.searchParams;
	const TABS = ['overview', 'analytics', 'usage'];
	let selectedTab = $state(
		TABS.includes(initial.get('tab') ?? '') ? initial.get('tab')! : 'overview'
	);
	let usage = $state(usageFromParams(initial));
	// Usage keeps its own window (24 hours by default) and updates only on demand.
	let usageAnchor = $state(Date.now());
	const usageResolved = $derived(resolveRange(usage.range, usageAnchor));
	// An admin with cluster scope picks a Workspace or all; anyone else sees their own.
	const clusterWide = $derived(isClusterAdmin && canViewClusterMetrics);
	/** The Workspace's list of one kind of resource. */
	function resourceListHref(kind: {
		group: string;
		version: string;
		kind: string;
		resource: string;
	}): string {
		const base = resolve('/(auth)/[cluster]/[workspace]', {
			cluster,
			workspace: currentWorkspace || '_'
		});
		return `${base}?${new URLSearchParams(kind)}`;
	}
	const manageKeysHref = $derived(
		resourceListHref({
			group: 'maas.phison.com',
			version: 'v1alpha1',
			kind: 'ApiKey',
			resource: 'apikeys'
		})
	);
	// AI Studio › Model, where an empty Overview sends you to deploy one.
	const modelServiceHref = $derived(
		resourceListHref({
			group: 'serving.kserve.io',
			version: 'v1alpha2',
			kind: 'LLMInferenceService',
			resource: 'llminferenceservices'
		})
	);
	function longerUsageRange() {
		usage.range = { kind: 'relative', minutes: 7 * 24 * 60 };
		usageAnchor = Date.now();
	}
	// Usage has no auto update; it reports when its last fetch finished.
	let usageUpdatedAt = $state<number | undefined>(undefined);
	let usageUpdating = $state(false);
	function usageFetching(busy: boolean) {
		usageUpdating = busy;
		if (!busy) usageUpdatedAt = Date.now();
	}
	function usageBackToNow() {
		usage.range = toNow(usage.range);
		usageAnchor = Date.now();
	}

	/** Currently selected namespace; empty string means "all namespaces" */
	let selectedNamespace = $state<string | undefined>(getInitialNamespace());

	// An admin with cluster scope starts on every Workspace; anyone else sees their own.
	function getInitialNamespace() {
		if (clusterWide) return '';
		return defaultNamespace !== '' ? defaultNamespace : undefined;
	}
	/**
	 * Analytics state lives in the URL: `?tab=analytics&model=<namespace>/<id>&mode=history&rank=kv`
	 * plus History's window. The id is a service name, or `standalone:<model_name>` (which may
	 * hold a slash); a bare id from an older link is matched against the ranking.
	 */
	const ANALYTICS_PARAM_KEYS = ['model', 'mode', 'rank', 'range', 'from', 'to'];
	let selectedModel = $state<string | undefined>(initial.get('model') ?? undefined);
	let analyticsMode = $state<'now' | 'history'>(
		initial.get('mode') === 'history' ? 'history' : 'now'
	);
	let rankTab = $state<RankTab>(tabFromParam(initial.get('rank')));
	function openInAnalytics(model: { id: string; namespace: string }) {
		selectedModel = `${model.namespace}/${model.id}`;
		selectedTab = 'analytics';
	}

	// History's window: a quick range ends at its anchor, which moves to now when History is
	// entered or the range is picked; a fixed range stays where it was set. Nothing refetches on a
	// timer in History.
	let analyticsRange = $state<TimeRange>(rangeFromParams(initial));
	let analyticsAnchor = $state(Date.now());
	const analyticsResolved = $derived(resolveRange(analyticsRange, analyticsAnchor));
	const analyticsStart = $derived(new Date(analyticsResolved.start));
	const analyticsEnd = $derived(new Date(analyticsResolved.end));
	const analyticsWindow = $derived(
		analyticsRange.kind === 'relative'
			? m.analytics_window_last({ duration: formatDuration(analyticsRange.minutes * 60) })
			: formatSpan(analyticsResolved.start, analyticsResolved.end)
	);
	function setMode(mode: 'now' | 'history') {
		if (mode === 'history' && analyticsRange.kind === 'relative') analyticsAnchor = Date.now();
		analyticsMode = mode;
	}

	// replaceState throws until the router has started; afterNavigate runs once it has.
	let routerReady = $state(false);
	afterNavigate(() => (routerReady = true));
	$effect(() => {
		if (!routerReady) return;
		const url = new URL(page.url);
		for (const key of ['tab', ...ANALYTICS_PARAM_KEYS, ...USAGE_PARAM_KEYS]) {
			url.searchParams.delete(key);
		}
		if (selectedTab !== 'overview') url.searchParams.set('tab', selectedTab);
		if (selectedTab === 'analytics') {
			if (selectedModel) url.searchParams.set('model', selectedModel);
			if (analyticsMode === 'history') {
				url.searchParams.set('mode', 'history');
				for (const [k, v] of Object.entries(rangeToParams(analyticsRange))) {
					url.searchParams.set(k, v);
				}
			}
			if (rankTab !== 'requests') url.searchParams.set('rank', rankTab);
		}
		if (selectedTab === 'usage') {
			for (const [k, v] of usageToParams(usage)) {
				if (k === 'ws' && !clusterWide) continue;
				url.searchParams.set(k, v);
			}
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, only the query changes
		if (url.search !== page.url.search) replaceState(url, page.state);
	});

	const inAnalytics = $derived(selectedTab === 'analytics');
	function longerAnalyticsRange() {
		analyticsRange = { kind: 'relative', minutes: 7 * 24 * 60 };
		analyticsAnchor = Date.now();
	}

	// A window ending "now" is anchored when picked; a fixed window stays where it was set.
	let range = $state<TimeRange>(DEFAULT_RANGE);
	let anchor = $state(Date.now());
	const resolved = $derived(resolveRange(range, anchor));
	const start = $derived(new Date(resolved.start));
	const end = $derived(new Date(resolved.end));
	const endIsNow = $derived(range.kind === 'relative');

	const dashboardTimeRangeKey = $derived(`${resolved.start}-${resolved.end}`);

	// Overview and Analytics cards refetch every 10 s while auto update is on; a new window
	// remounts them. The clock keeps the refresh control's "updated" time in step with both.
	const clock = new AutoRefresh();
	$effect(() => clock.run(isReloading));
	const updatedAt = $derived(Math.max(clock.updatedAt, anchor));
	function refresh() {
		anchor = Date.now();
		clock.mark();
	}
	function backToNow() {
		range = toNow(range);
		refresh();
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Same title as Cluster Status. Overview and Analytics name their source; Usage keeps its line. -->
	<header>
		<h1 class="text-3xl leading-9 font-[350] tracking-tight">{m.model_status()}</h1>
		{#if selectedTab !== 'usage'}
			<p
				class="mt-0.5 flex min-h-5 min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-sm text-muted-foreground"
			>
				<span class="flex max-w-full min-w-0 items-baseline gap-1.5">
					<span class="shrink-0">{m.cluster()}</span>
					<span class="min-w-0 truncate font-mono text-[0.8125rem] text-foreground" title={cluster}>
						{cluster}
					</span>
				</span>
				<span>{m.model_overview_engine_metrics()}</span>
			</p>
		{:else}
			<p class="mt-0.5 text-base text-muted-foreground">{m.llm_dashboard_description()}</p>
		{/if}
	</header>
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<Tabs.Root bind:value={selectedTab}>
				<!-- Usage has two controls more than fits a phone beside the tabs, so its row wraps. -->
				<div class="flex flex-wrap justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<Tabs.List>
							<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
							<Tabs.Trigger value="analytics">{m.analytics()}</Tabs.Trigger>
							<Tabs.Trigger value="usage">{m.usage()}</Tabs.Trigger>
						</Tabs.List>
						{#if inAnalytics}
							<Tabs.Root
								value={analyticsMode}
								onValueChange={(v) => setMode(v === 'history' ? 'history' : 'now')}
							>
								<Tabs.List aria-label={m.model_analytics_mode()}>
									<Tabs.Trigger value="now">{m.analytics_now()}</Tabs.Trigger>
									<Tabs.Trigger value="history">{m.analytics_history()}</Tabs.Trigger>
								</Tabs.List>
							</Tabs.Root>
						{/if}
					</div>
					{#if selectedTab === 'usage'}
						<div class="flex flex-wrap items-center justify-end gap-2">
							<WorkspaceFilter
								{cluster}
								bind:namespace={usage.namespace}
								fixed={clusterWide ? undefined : currentWorkspace || defaultNamespace}
							/>
							<RangePicker bind:range={usage.range} bind:anchor={usageAnchor} />
							<RefreshControl
								updatedAt={usageUpdatedAt}
								updating={usageUpdating}
								past={usage.range.kind !== 'relative'}
								onrefresh={() => (usageAnchor = Date.now())}
								onnow={usageBackToNow}
							/>
						</div>
					{:else}
						<div class="flex flex-wrap items-center justify-end gap-2">
							<!-- Another Workspace is reachable only at cluster scope: an admin whose
						cluster metrics access is denied or unknown queries this one alone. -->
							{#if clusterWide}
								<!-- The picker appears once the Workspaces are listed; a block holds its place
								     until then, so the controls beside it do not move. -->
								<div class="group/ws relative min-h-9 min-w-[11rem] sm:min-w-[12rem]">
									<Skeleton class="absolute inset-0 rounded-lg group-has-[button]/ws:hidden" />
									<NamespacePicker
										{cluster}
										{isClusterAdmin}
										{currentWorkspace}
										defaultAll
										bind:namespace={selectedNamespace}
									/>
								</div>
							{/if}
							{#if !inAnalytics}
								<RangePicker bind:range bind:anchor />
								<RefreshControl
									bind:live={isReloading}
									{updatedAt}
									past={!endIsNow}
									onrefresh={refresh}
									onnow={backToNow}
								/>
							{:else if analyticsMode === 'history'}
								<!-- History updates only when its window changes. -->
								<RangePicker bind:range={analyticsRange} bind:anchor={analyticsAnchor} />
							{:else}
								<RefreshControl
									bind:live={isReloading}
									updatedAt={clock.updatedAt}
									onrefresh={() => clock.mark()}
								/>
							{/if}
						</div>
					{/if}
				</div>
				<Tabs.Content value="overview">
					{#if selectedTab === 'overview'}
						{#key `${selectedNamespace ?? ''}-${dashboardTimeRangeKey}`}
							<Overview
								{prometheusDriver}
								namespace={selectedNamespace ?? ''}
								{cluster}
								{start}
								{end}
								{endIsNow}
								emptyHref={modelServiceHref}
								onopen={openInAnalytics}
								bind:isReloading
							/>
						{/key}
					{/if}
				</Tabs.Content>
				<Tabs.Content value="analytics">
					{#if selectedTab === 'analytics'}
						{#key selectedNamespace ?? ''}
							<Dashboard
								{cluster}
								namespace={selectedNamespace ?? ''}
								client={prometheusDriver}
								{shared}
								history={analyticsMode === 'history'}
								tick={analyticsMode === 'now' ? clock.tick : 0}
								start={analyticsStart}
								end={analyticsEnd}
								windowLabel={analyticsWindow}
								bind:selected={selectedModel}
								bind:tab={rankTab}
								deployHref={modelServiceHref}
								onLonger={analyticsRange.kind === 'relative' && analyticsRange.minutes < 10080
									? longerAnalyticsRange
									: undefined}
							/>
						{/key}
					{/if}
				</Tabs.Content>
				<Tabs.Content value="usage">
					{#if selectedTab === 'usage'}
						<Usage
							client={prometheusDriver}
							{cluster}
							bind:params={usage}
							onfetching={usageFetching}
							start={usageResolved.start}
							end={usageResolved.end}
							clusterScope={canViewClusterMetrics}
							everywhere={clusterWide}
							{currentWorkspace}
							{defaultNamespace}
							{manageKeysHref}
							windowMinutes={usage.range.kind === 'relative' ? usage.range.minutes : undefined}
							onLongerRange={usage.range.kind === 'relative' && usage.range.minutes < 10080
								? longerUsageRange
								: undefined}
						/>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
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
