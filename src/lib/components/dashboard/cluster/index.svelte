<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import {
		CalendarDateTime,
		DatetimePicker,
		getLocalTimeZone,
		minutesAgoCDT,
		nowCDT
	} from '$lib/components/custom/datetime-picker';
	import AutoUpdate from '$lib/components/dashboard/shared/auto-update.svelte';
	import { cardClass } from '$lib/components/dashboard/shared/status';
	import WidgetState from '$lib/components/dashboard/shared/widget-state.svelte';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/shadcnio/tabs';
	import { m } from '$lib/messages';
	import { clusterPrometheusDriver } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { Dashboard as AnalyticsDashboard } from './analytics/index';
	import NamespacePicker from './analytics/namespace/namespace-picker.svelte';
	import NodePicker from './analytics/node/node-picker.svelte';
	import Ai100Disk from './overview/ai100-disk.svelte';
	import Consumption from './overview/consumption.svelte';
	import Cpu from './overview/cpu.svelte';
	import Deployments from './overview/deployments.svelte';
	import Gpu from './overview/gpu.svelte';
	import Health from './overview/health.svelte';
	import Information from './overview/information.svelte';
	import Memory from './overview/memory.svelte';
	import NodePressure from './overview/node-pressure.svelte';
	import Nodes from './overview/nodes.svelte';
	import Pods from './overview/pods.svelte';
	import Uptime from './overview/uptime.svelte';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let driverFailed = $state(false);
	let selectedTab = $state('overview');
	// Analytics splits by altitude: `node` shows per-node pressure + detail (Sections A+B),
	// `namespace` shows namespace / pod consumption (Section C). The toolbar pickers follow suit.
	let analyticsView = $state<'node' | 'namespace'>('node');
	// Analytics drill-down filters. `selectedNode` holds the node_exporter `instance`;
	// `.*` is the "all" sentinel for namespace / pod / container.
	let selectedNode = $state<string | undefined>(undefined);
	let selectedNamespace = $state<string | undefined>(undefined);

	let pickerFrom = $state<CalendarDateTime>(minutesAgoCDT(60));
	let pickerTo = $state<CalendarDateTime>(nowCDT());
	let pickerToIsNow = $state(true);

	const start = $derived(pickerFrom.toDate(getLocalTimeZone()));
	const end = $derived(pickerToIsNow ? new Date() : pickerTo.toDate(getLocalTimeZone()));

	const dashboardTimeRangeKey = $derived(
		`${pickerFrom.toDate(getLocalTimeZone()).getTime()}-${
			pickerToIsNow ? 'now' : pickerTo.toDate(getLocalTimeZone()).getTime()
		}-${pickerToIsNow}`
	);

	onMount(async () => {
		try {
			prometheusDriver = clusterPrometheusDriver(cluster);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
			driverFailed = true;
		}
	});

	onDestroy(() => {
		isReloading = false;
	});

	// The grids follow the width of the content column, not of the window: the sidebar takes a
	// fixed slice of the window, so the same window can leave very different room for cards.
	const statGrid = 'grid grid-cols-1 gap-5 @sm/cluster:grid-cols-2 @4xl/cluster:grid-cols-4';
	const resourceGrid = 'grid grid-cols-1 gap-5 @md/cluster:grid-cols-2 @4xl/cluster:grid-cols-4';
	// A compact segmented control: the selected segment carries its own ground, so it is right
	// even while the group is not laid out (the sliding indicator cannot be measured then).
	const segmentList =
		'h-9 rounded-lg border border-border bg-muted/40 p-0.5 group-data-horizontal/tabs:h-9 [&_[data-slot=tab-indicator]]:hidden';
	const segment =
		'h-full px-3 data-[selected]:bg-background data-[selected]:shadow-sm dark:data-[selected]:bg-accent';
</script>

<div class="@container/cluster grid min-w-0 gap-5">
	<header class="grid min-w-0 gap-1">
		<h1 class="text-2xl font-medium text-balance">{m.cluster_status()}</h1>
		<p class="text-sm text-pretty text-muted-foreground">{m.k8s_overview_description()}</p>
	</header>
	{#if prometheusDriver}
		<Tabs
			value={selectedTab}
			onValueChange={(details) => (selectedTab = details.value)}
			class="min-w-0 gap-5"
		>
			<div class="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
				<TabsList class={segmentList}>
					<TabsTrigger value="overview" class={segment}>{m.overview()}</TabsTrigger>
					<TabsTrigger value="analytics" class={segment}>{m.analytics()}</TabsTrigger>
				</TabsList>
				<div class="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
					<!-- Analytics only. Kept mounted on the Overview tab so the pickers keep their
					     selection, but out of the layout there: it takes no room and cannot be reached. -->
					<div
						class={cn(
							'flex min-w-0 flex-wrap items-center justify-end gap-2',
							selectedTab !== 'analytics' && 'hidden'
						)}
					>
						<Tabs
							value={analyticsView}
							onValueChange={(details) =>
								(analyticsView = details.value === 'namespace' ? 'namespace' : 'node')}
						>
							<TabsList class={segmentList} aria-label={m.clo_analytics_scope()}>
								<TabsTrigger value="node" class={segment}>{m.node()}</TabsTrigger>
								<TabsTrigger value="namespace" class={segment}>{m.namespace()}</TabsTrigger>
							</TabsList>
						</Tabs>
						<div class="flex min-h-9 max-w-full min-w-40 items-center justify-end">
							{#if analyticsView === 'node'}
								<NodePicker {prometheusDriver} bind:selectedNode />
							{:else}
								<NamespacePicker {prometheusDriver} bind:selectedNamespace />
							{/if}
						</div>
						<div class="max-w-full min-w-0">
							<DatetimePicker
								bind:from={pickerFrom}
								bind:to={pickerTo}
								bind:toIsNow={pickerToIsNow}
							/>
						</div>
					</div>
					<AutoUpdate bind:checked={isReloading} />
				</div>
			</div>
			<TabsContent value="overview" class="grid min-w-0 gap-5">
				<div class={statGrid}>
					<Health {prometheusDriver} bind:isReloading />
					<Nodes {prometheusDriver} bind:isReloading />
					<Deployments {prometheusDriver} bind:isReloading />
					<Uptime {prometheusDriver} bind:isReloading />
					<div class="min-w-0 @sm/cluster:col-span-2">
						<Pods {prometheusDriver} bind:isReloading />
					</div>
					<Information {prometheusDriver} bind:isReloading />
					<Consumption {prometheusDriver} bind:isReloading />
				</div>
				<div class={resourceGrid}>
					<Cpu {prometheusDriver} bind:isReloading />
					<Memory {prometheusDriver} bind:isReloading />
					<Gpu {prometheusDriver} bind:isReloading />
					<Ai100Disk {prometheusDriver} bind:isReloading />
				</div>
				<NodePressure {prometheusDriver} bind:isReloading />
			</TabsContent>
			<TabsContent value="analytics" class="min-w-0">
				{#key dashboardTimeRangeKey}
					<AnalyticsDashboard
						client={prometheusDriver}
						view={analyticsView}
						bind:selectedNode
						bind:selectedNamespace
						{start}
						{end}
						endIsNow={pickerToIsNow}
						bind:isReloading
					/>
				{/key}
			</TabsContent>
		</Tabs>
	{:else if driverFailed}
		<div class={cn(cardClass, 'flex min-h-64 items-center justify-center')}>
			<WidgetState kind="error" />
		</div>
	{:else if cluster}
		<!-- The driver is not there yet: the page in outline, so nothing jumps when it is. -->
		<div class="grid min-w-0 gap-5" aria-busy="true">
			<Skeleton class="h-9 w-48" />
			<div class={statGrid}>
				{#each [0, 1, 2, 3] as tile (tile)}
					<Skeleton class="h-28 rounded-xl" />
				{/each}
				<Skeleton class="h-28 rounded-xl @sm/cluster:col-span-2" />
				<Skeleton class="h-28 rounded-xl" />
				<Skeleton class="h-28 rounded-xl" />
			</div>
			<div class={resourceGrid}>
				{#each [0, 1, 2, 3] as card (card)}
					<Skeleton class="h-80 rounded-xl" />
				{/each}
			</div>
			<Skeleton class="h-56 rounded-xl" />
		</div>
	{:else}
		<div class={cn(cardClass, 'flex min-h-64 items-center justify-center')}>
			<WidgetState kind="empty" description={m.clo_no_cluster()} />
		</div>
	{/if}
</div>
