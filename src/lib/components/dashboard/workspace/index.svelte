<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy } from 'svelte';

	import { AutoRefresh, RefreshControl, reloadNow } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';
	import { dashboardBody, sharedMetrics, workspacePrometheusDriver } from '$lib/prometheus';

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
	// Every card refetches on its own every 10 s while auto update is on; this clock keeps the
	// refresh control's "updated" time in step with them.
	const clock = new AutoRefresh();
	$effect(() => clock.run(isReloading));
	function refresh() {
		reloadNow(
			() => isReloading,
			(value) => (isReloading = value)
		);
		clock.mark();
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
	const initialized = true;
	const body = $derived(
		dashboardBody({
			hasDriver: prometheusDriver !== null,
			initialized,
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
<div class="@container space-y-4 pb-6">
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
		<Tabs.Root value="overview" class="gap-0">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Tabs.List class="rounded-full">
					<Tabs.Trigger value="overview" class="rounded-full px-3">{m.overview()}</Tabs.Trigger>
					<Tabs.Trigger value="analytics" class="rounded-full px-3" disabled>
						{m.analytics()}
					</Tabs.Trigger>
				</Tabs.List>
				<!-- No time range here: every card is a reading of "now", so a picker would change
				     nothing. The cluster page shows one only on its Analytics tab, where charts use it. -->
				<RefreshControl bind:live={isReloading} updatedAt={clock.updatedAt} onrefresh={refresh} />
			</div>
			<Tabs.Content value="overview" class="grid grid-cols-12 gap-2 pt-3 @md:gap-3">
				<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
			</Tabs.Content>
			<Tabs.Content value="analytics"></Tabs.Content>
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
