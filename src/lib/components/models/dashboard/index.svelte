<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import {
		CalendarDateTime,
		DatetimePicker,
		getLocalTimeZone
	} from '$lib/components/custom/datetime-picker';
	import { NamespacePicker } from '$lib/components/custom/namespace-picker';
	import { Reloader } from '$lib/components/custom/reloader';
	import { Dashboard } from '$lib/components/models/dashboard/analytics';
	import ModelPicker from '$lib/components/models/dashboard/analytics/model-picker.svelte';
	import { Overview } from '$lib/components/models/dashboard/overview/index';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

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

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let selectedTab = $state('overview');
	/** Currently selected namespace; empty string means "all namespaces" */
	let selectedNamespace = $state<string | undefined>(
		defaultNamespace !== '' ? defaultNamespace : undefined
	);
	/** vLLM analytics model filter; lives next to NamespacePicker so chart grid does not shift vertically */
	let selectedModel = $state<string | undefined>(undefined);

	function nowCDT(): CalendarDateTime {
		const d = new Date();
		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes()
		);
	}
	function minutesAgoCDT(min: number): CalendarDateTime {
		const d = new Date(Date.now() - min * 60 * 1000);
		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes()
		);
	}

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
					{m.model_status()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.llm_dashboard_description()}
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
							<ModelPicker {cluster} namespace={selectedNamespace} bind:selectedModel />
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
				<Tabs.Content value="overview">
					{#if selectedTab === 'overview'}
						{#key `${selectedNamespace ?? ''}-${dashboardTimeRangeKey}`}
							<Overview
								{prometheusDriver}
								namespace={selectedNamespace ?? ''}
								{cluster}
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
						{#key `${selectedNamespace ?? ''}-${dashboardTimeRangeKey}`}
							<Dashboard
								{cluster}
								namespace={selectedNamespace}
								client={prometheusDriver}
								bind:selectedModel
								{start}
								{end}
								endIsNow={pickerToIsNow}
								bind:isReloading
							/>
						{/key}
					{/if}
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
