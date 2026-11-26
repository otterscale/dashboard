<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy } from 'svelte';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		DEFAULT_RANGE,
		formatSpan,
		rangeFromParams,
		rangeMinutes,
		RangePicker,
		rangeToParams,
		resolveRange,
		type TimeRange,
		toNow
	} from '$lib/components/custom/range-picker';
	import { AutoRefresh, RefreshControl, reloadNow } from '$lib/components/custom/reloader';
	import { Overview } from '$lib/components/dashboard/storage/overview';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';
	import { clusterPrometheusDriver } from '$lib/prometheus';

	import Analytics from './analytics/index.svelte';
	import { windowTitle } from './analytics/lib/format';
	import { type Dim, DIMS } from './analytics/lib/model';
	import Facts from './overview/facts.svelte';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);

	// Made while the component is created, on the server too: it only holds where to ask, and asks
	// nothing until a card loads in the browser. So the first paint already shows the cards.
	function createDriver(): PrometheusDriver | null {
		try {
			return clusterPrometheusDriver(cluster);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
			return null;
		}
	}
	const prometheusDriver = createDriver();

	// Analytics state lives in the URL (`?tab=analytics&by=pool&sel=ceph-blockpool&mode=history`),
	// so a reload, a shared link or a pool name in Overview opens the same thing in the same mode.
	const HISTORY_DEFAULT: TimeRange = { kind: 'relative', minutes: 7 * 24 * 60 };
	type UrlState = {
		tab: 'overview' | 'analytics';
		dim: Dim;
		mode: 'now' | 'history';
		sel?: string;
		range: TimeRange;
	};
	function fromUrl(params: URLSearchParams): UrlState {
		const by = params.get('by');
		const dim = DIMS.includes(by as Dim) ? (by as Dim) : 'pool';
		const linksAnalytics = ['by', 'sel', 'mode'].some((k) => params.has(k));
		return {
			tab: params.get('tab') === 'analytics' || linksAnalytics ? 'analytics' : 'overview',
			dim,
			mode: params.get('mode') === 'history' ? 'history' : 'now',
			sel: params.get('sel') ?? undefined,
			// Capacity grows by the day, so History opens on the last 7 days.
			range: ['range', 'from', 'to'].some((k) => params.has(k))
				? rangeFromParams(params)
				: HISTORY_DEFAULT
		};
	}
	const initial = fromUrl(page.url.searchParams);
	let selectedTab = $state(initial.tab);
	let dim = $state<Dim>(initial.dim);
	let mode = $state(initial.mode);
	// One pick per view, kept while switching view or mode.
	let selected = $state<Record<Dim, string | undefined>>({
		pool: undefined,
		osd: undefined,
		pvc: undefined,
		[initial.dim]: initial.sel
	});
	let historyRange = $state<TimeRange>(initial.range);
	let historyAnchor = $state(Date.now());

	// replaceState throws until the router has started; afterNavigate runs once it has. A link to
	// this page (Overview's pool names) changes only the query, so its state is read here too.
	let routerReady = $state(false);
	afterNavigate(({ type, to }) => {
		routerReady = true;
		if (type === 'enter' || !to) return;
		const next = fromUrl(to.url.searchParams);
		if (next.tab !== 'analytics') return;
		selectedTab = 'analytics';
		dim = next.dim;
		mode = next.mode;
		if (next.sel) selected[next.dim] = next.sel;
	});
	$effect(() => {
		if (!routerReady) return;
		const url = new URL(page.url);
		for (const key of ['tab', 'by', 'sel', 'mode', 'range', 'from', 'to']) {
			url.searchParams.delete(key);
		}
		if (selectedTab === 'analytics') {
			url.searchParams.set('tab', 'analytics');
			url.searchParams.set('by', dim);
			const sel = selected[dim];
			if (sel) url.searchParams.set('sel', sel);
			if (mode === 'history') {
				url.searchParams.set('mode', 'history');
				for (const [k, v] of Object.entries(rangeToParams(historyRange))) {
					url.searchParams.set(k, v);
				}
			}
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, only the query changes
		if (url.search !== page.url.search) replaceState(url, page.state);
	});

	// The window is for the Performance charts. A window ending "now" is anchored when picked and
	// slides with auto update; a fixed window stays where it was set.
	let range = $state<TimeRange>(DEFAULT_RANGE);
	let anchor = $state(Date.now());
	const endIsNow = $derived(range.kind === 'relative');

	const inAnalytics = $derived(selectedTab === 'analytics');
	const inHistory = $derived(inAnalytics && mode === 'history');

	// Every card refetches every 10 s while auto update is on, except in History, which updates
	// on demand. The clock keeps the refresh control's "updated" time in step, slides a window
	// that ends now, and bumps `tick` for the Analytics lists and Now cards.
	const clock = new AutoRefresh();
	$effect(() => {
		if (!inHistory) return clock.run(isReloading);
	});
	const updatedAt = $derived(Math.max(clock.updatedAt, anchor));
	const resolved = $derived(resolveRange(range, endIsNow ? updatedAt : anchor));

	// History's window. A quick range ends at `historyAnchor`, which moves to now when History is
	// entered or refreshed; a fixed range stays where it was set.
	const historyResolved = $derived(resolveRange(historyRange, historyAnchor));
	const historyStart = $derived(new Date(historyResolved.start));
	const historyEnd = $derived(new Date(historyResolved.end));
	const windowLabel = $derived(
		windowTitle(
			rangeMinutes(historyRange),
			historyRange.kind === 'relative',
			formatSpan(historyResolved.start, historyResolved.end)
		)
	);

	function setMode(next: 'now' | 'history') {
		if (next === 'history' && historyRange.kind === 'relative') historyAnchor = Date.now();
		mode = next;
	}

	function refresh() {
		if (inHistory) {
			historyAnchor = Date.now();
			clock.mark();
			return;
		}
		reloadNow(
			() => isReloading,
			(value) => (isReloading = value)
		);
		anchor = Date.now();
		clock.mark();
	}
	function backToNow() {
		range = toNow(range);
		refresh();
	}
	function historyToNow() {
		historyRange = toNow(historyRange);
		historyAnchor = Date.now();
	}

	const TAB_LIST = 'rounded-full';
	const TAB_TRIGGER = 'rounded-full px-3 data-active:bg-card dark:data-active:bg-card';

	onDestroy(() => {
		isReloading = false;
	});
</script>

<!-- `@container`: every layout below follows this element's width, not the viewport's. -->
<div class="@container pb-8">
	<header>
		<h1 class="text-3xl leading-9 font-[350] tracking-tight">{m.storage_status()}</h1>
		{#if prometheusDriver}
			<Facts client={prometheusDriver} />
		{/if}
	</header>
	{#if prometheusDriver}
		<div class="mt-4 w-full">
			<Tabs.Root bind:value={selectedTab}>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<Tabs.List class={TAB_LIST}>
							<Tabs.Trigger value="overview" class={TAB_TRIGGER}>{m.overview()}</Tabs.Trigger>
							<Tabs.Trigger value="analytics" class={TAB_TRIGGER}>{m.analytics()}</Tabs.Trigger>
						</Tabs.List>
						{#if inAnalytics}
							<Tabs.Root
								value={mode}
								onValueChange={(v) => setMode(v === 'history' ? 'history' : 'now')}
							>
								<Tabs.List class={TAB_LIST}>
									<Tabs.Trigger value="now" class={TAB_TRIGGER}>{m.analytics_now()}</Tabs.Trigger>
									<Tabs.Trigger value="history" class={TAB_TRIGGER}
										>{m.analytics_history()}</Tabs.Trigger
									>
								</Tabs.List>
							</Tabs.Root>
						{/if}
					</div>
					<div class="flex flex-wrap items-center justify-end gap-2">
						{#if inHistory}
							<!-- History only updates on demand: ↻ moves its window to now. -->
							<RangePicker bind:range={historyRange} bind:anchor={historyAnchor} />
							<RefreshControl
								updatedAt={historyRange.kind === 'relative' ? historyAnchor : undefined}
								past={historyRange.kind !== 'relative'}
								onrefresh={refresh}
								onnow={historyToNow}
							/>
						{:else if inAnalytics}
							<RefreshControl
								bind:live={isReloading}
								updatedAt={clock.updatedAt}
								onrefresh={refresh}
							/>
						{:else}
							<RangePicker bind:range bind:anchor />
							<RefreshControl
								bind:live={isReloading}
								{updatedAt}
								past={!endIsNow}
								onrefresh={refresh}
								onnow={backToNow}
							/>
						{/if}
					</div>
				</div>
				<!-- Tabs keep both panels in the page; only the shown one is mounted, so the hidden one
				     does not keep polling Prometheus. -->
				<Tabs.Content value="overview" class="pt-3">
					{#if !inAnalytics}
						<Overview
							client={prometheusDriver}
							start={new Date(resolved.start)}
							end={new Date(resolved.end)}
							bind:isReloading
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="analytics" class="pt-3">
					{#if inAnalytics}
						<Analytics
							client={prometheusDriver}
							bind:dim
							bind:selected
							history={inHistory}
							start={historyStart}
							end={historyEnd}
							{windowLabel}
							tick={clock.tick}
						/>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</div>
