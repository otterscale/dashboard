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
	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import PageHeader from '$lib/components/dashboard/shared/page-header.svelte';
	import Segmented from '$lib/components/dashboard/shared/segmented.svelte';
	import { Spinner } from '$lib/components/shadcnio/spinner';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/shadcnio/tabs';
	import { m } from '$lib/messages';
	import { clusterPrometheusDriver } from '$lib/prometheus';

	import { Dashboard as AnalyticsDashboard } from './analytics/index';
	import NamespacePicker from './analytics/namespace/namespace-picker.svelte';
	import NodePicker from './analytics/node/node-picker.svelte';
	import NodePressure from './overview/node-pressure.svelte';
	import { widgets } from './overview/widgets';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
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
		}
	});

	onDestroy(() => {
		isReloading = false;
	});
</script>

<div class="flex flex-col gap-5">
	<PageHeader title={m.cluster_status()} description={m.k8s_overview_description()}>
		{#snippet actions()}
			{#if prometheusDriver}
				<Reloader bind:checked={isReloading} />
			{/if}
		{/snippet}
	</PageHeader>
	{#if prometheusDriver}
		<Tabs
			value={selectedTab}
			onValueChange={(details) => (selectedTab = details.value)}
			class="gap-5"
		>
			<TabsList variant="line" class="w-full justify-start rounded-none border-b px-0">
				<TabsTrigger value="overview" class="flex-none px-3">{m.overview()}</TabsTrigger>
				<TabsTrigger value="analytics" class="flex-none px-3">{m.analytics()}</TabsTrigger>
			</TabsList>
			<TabsContent value="overview" class="flex flex-col gap-4">
				<div class="grid grid-cols-12 gap-4">
					<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
				</div>
				<NodePressure {prometheusDriver} bind:isReloading />
			</TabsContent>
			<TabsContent value="analytics" class="flex flex-col gap-4">
				<!-- What the charts below are of: which altitude, which node or namespace, which window. -->
				<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<div class="flex flex-wrap items-center gap-2">
						<Segmented
							aria-label={`${m.node()} / ${m.namespace()}`}
							bind:value={analyticsView}
							options={[
								{ value: 'node', label: m.node() },
								{ value: 'namespace', label: m.namespace() }
							]}
						/>
						<div class="flex min-h-9 min-w-40 items-center">
							{#if analyticsView === 'node'}
								<NodePicker {prometheusDriver} bind:selectedNode />
							{:else}
								<NamespacePicker {prometheusDriver} bind:selectedNamespace />
							{/if}
						</div>
					</div>
					<DatetimePicker bind:from={pickerFrom} bind:to={pickerTo} bind:toIsNow={pickerToIsNow} />
				</div>
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
	{:else if cluster}
		<div class="flex min-h-[400px] w-full items-center justify-center">
			<Spinner class="size-8 text-muted-foreground" />
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</div>
