<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import {
		CalendarDateTime,
		DatetimePicker,
		getLocalTimeZone,
		minutesAgoCDT,
		nowCDT
	} from '$lib/components/custom/datetime-picker';
	import { NamespacePicker } from '$lib/components/custom/namespace-picker';
	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	import { Dashboard as AnalyticsDashboard } from './analytics/index';
	import VmPicker from './analytics/vm-picker.svelte';
	import { widgets } from './overview/widgets';

	let {
		cluster,
		currentWorkspace = '',
		defaultNamespace = '',
		isClusterAdmin = false
	}: {
		cluster: string;
		/** Name of the currently active workspace (for default picker selection) */
		currentWorkspace?: string;
		/** Workspace namespace used as initial namespace state */
		defaultNamespace?: string;
		isClusterAdmin?: boolean;
	} = $props();

	/** Currently selected namespace; empty string means "all namespaces" */
	let selectedNamespace = $state<string | undefined>(
		defaultNamespace !== '' ? defaultNamespace : undefined
	);
	let selectedTab = $state('overview');
	let selectedVM = $state<string | undefined>(undefined);

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);

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
					{m.compute_status()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.compute_dashboard_description()}
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
							class="flex min-h-9 min-w-[11rem] shrink-0 items-center justify-end sm:min-w-[12rem] {selectedTab !==
							'analytics'
								? 'pointer-events-none invisible select-none'
								: ''}"
							aria-hidden={selectedTab !== 'analytics'}
						>
							{#if prometheusDriver}
								<VmPicker {prometheusDriver} namespace={selectedNamespace} bind:selectedVM />
							{/if}
						</div>
						<NamespacePicker
							{cluster}
							{isClusterAdmin}
							{currentWorkspace}
							bind:namespace={selectedNamespace}
						/>
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
					class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-12"
				>
					{#if selectedTab === 'overview'}
						{#key `${selectedNamespace ?? ''}-${dashboardTimeRangeKey}`}
							<WidgetGrid
								{widgets}
								{prometheusDriver}
								{cluster}
								namespace={selectedNamespace ?? ''}
								{start}
								{end}
								endIsNow={pickerToIsNow}
								bind:isReloading
							/>
						{/key}
					{/if}
				</Tabs.Content>
				<Tabs.Content value="analytics">
					{#if selectedTab === 'analytics'}
						{#key `${selectedNamespace ?? ''}-${selectedVM ?? ''}`}
							<AnalyticsDashboard
								client={prometheusDriver}
								namespace={selectedNamespace}
								bind:selectedVM
							/>
						{/key}
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</div>
