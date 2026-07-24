<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
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
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/messages';

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
			prometheusDriver = new PrometheusDriver({
				endpoint: `/proxy/${cluster}/prometheus`,
				baseURL: '/api/v1',
				headers: {
					'x-proxy-target': 'api'
				}
			});
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
		}
	});

	onDestroy(() => {
		isReloading = false;
	});
</script>

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">
					{m.cluster_status()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.k8s_overview_description()}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<Tabs.Root bind:value={selectedTab}>
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics">{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<div
							class="flex flex-wrap items-center justify-end gap-2 {selectedTab !== 'analytics'
								? 'pointer-events-none invisible select-none'
								: ''}"
							aria-hidden={selectedTab !== 'analytics'}
						>
							<Tabs.Root bind:value={analyticsView}>
								<Tabs.List>
									<Tabs.Trigger value="node">{m.node()}</Tabs.Trigger>
									<Tabs.Trigger value="namespace">{m.namespace()}</Tabs.Trigger>
								</Tabs.List>
							</Tabs.Root>
							{#if analyticsView === 'node'}
								<div class="flex min-h-9 min-w-40 shrink-0 items-center justify-end">
									<NodePicker {prometheusDriver} bind:selectedNode />
								</div>
							{:else}
								<div class="flex min-h-9 min-w-40 shrink-0 items-center justify-end">
									<NamespacePicker {prometheusDriver} bind:selectedNamespace />
								</div>
							{/if}
							<DatetimePicker
								bind:from={pickerFrom}
								bind:to={pickerTo}
								bind:toIsNow={pickerToIsNow}
							/>
						</div>
						<Reloader bind:checked={isReloading} />
					</div>
				</div>
				<Tabs.Content value="overview">
					<div
						class="grid auto-rows-[minmax(140px,auto)] grid-cols-2 gap-4 pt-4 md:gap-6 lg:grid-cols-1 2xl:grid-cols-4"
					>
						<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
					</div>
					<div class="w-full pt-4 md:pt-6">
						<NodePressure {prometheusDriver} bind:isReloading />
					</div>
				</Tabs.Content>
				<Tabs.Content value="analytics">
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
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{:else if cluster}
		<div class="flex min-h-[400px] w-full items-center justify-center">
			<LoaderCircle class="size-12 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</div>
