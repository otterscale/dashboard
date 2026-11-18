<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import {
		CalendarDateTime,
		DatetimePicker,
		minutesAgoCDT,
		nowCDT
	} from '$lib/components/custom/datetime-picker';
	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import PageHeader from '$lib/components/dashboard/shared/page-header.svelte';
	import { Spinner } from '$lib/components/shadcnio/spinner';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/shadcnio/tabs';
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
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let initialized = $state(false);
	const body = $derived(
		dashboardBody({
			hasDriver: prometheusDriver !== null,
			initialized,
			cluster,
			namespace: namespace
		})
	);

	let pickerFrom = $state<CalendarDateTime>(minutesAgoCDT(60));
	let pickerTo = $state<CalendarDateTime>(nowCDT());
	let pickerToIsNow = $state(true);

	const shared = $derived(sharedMetrics(cluster, namespace));
	const widgets = $derived(
		workspaceOverviewWidgets.map((w) => ({
			...w,
			props: w.key === 'storage' ? { namespace, shared } : { namespace }
		}))
	);

	onMount(async () => {
		try {
			prometheusDriver = workspacePrometheusDriver(cluster, namespace, canViewClusterMetrics);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
		}
		initialized = true;
	});

	onDestroy(() => {
		isReloading = false;
	});
</script>

<div class="flex flex-col gap-5">
	<PageHeader
		title={m.workspace_dashboard_title()}
		description={m.workspace_dashboard_description()}
	>
		{#snippet actions()}
			{#if prometheusDriver}
				<DatetimePicker bind:from={pickerFrom} bind:to={pickerTo} bind:toIsNow={pickerToIsNow} />
				<Reloader bind:checked={isReloading} />
			{/if}
		{/snippet}
	</PageHeader>
	{#if prometheusDriver}
		<Tabs defaultValue="overview" class="gap-5">
			<TabsList variant="line" class="w-full justify-start rounded-none border-b px-0">
				<TabsTrigger value="overview" class="flex-none px-3">{m.overview()}</TabsTrigger>
				<TabsTrigger value="analytics" class="flex-none px-3" disabled>{m.analytics()}</TabsTrigger>
			</TabsList>
			<TabsContent value="overview" class="grid grid-cols-12 gap-4">
				<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
			</TabsContent>
			<TabsContent value="analytics"></TabsContent>
		</Tabs>
	{:else if body === 'loading'}
		<div class="flex min-h-[400px] w-full items-center justify-center">
			<Spinner class="size-8 text-muted-foreground" />
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
