<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
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
	import * as Item from '$lib/components/ui/item';
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

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">
					{m.workspace_dashboard_title()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.workspace_dashboard_description()}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<Tabs.Root value="overview">
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" disabled>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<DatetimePicker
							bind:from={pickerFrom}
							bind:to={pickerTo}
							bind:toIsNow={pickerToIsNow}
						/>
						<Reloader bind:checked={isReloading} />
					</div>
				</div>
				<Tabs.Content
					value="overview"
					class="grid auto-rows-auto grid-cols-2 gap-4 pt-4 md:gap-6 lg:grid-cols-12"
				>
					<WidgetGrid {cluster} {widgets} {prometheusDriver} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics"></Tabs.Content>
			</Tabs.Root>
		</div>
	{:else if body === 'loading'}
		<div class="flex min-h-[400px] w-full items-center justify-center">
			<LoaderCircle class="size-12 animate-spin text-muted-foreground" />
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
