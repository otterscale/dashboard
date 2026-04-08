<script lang="ts">
	import { TerminalSquareIcon } from '@lucide/svelte';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import {
		CalendarDateTime,
		DatetimePicker,
		getLocalTimeZone,
		minutesAgoCDT,
		nowCDT
	} from '$lib/components/custom/datetime-picker';
	import Reloader from '$lib/components/custom/reloader/reloader.svelte';
	import RookCephViewer from '$lib/components/resource-viewer/viewers/rook-ceph-viewer.svelte';
	import { Overview } from '$lib/components/storage/dashboard/overview';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	let { cluster }: { cluster: string } = $props();

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
					{m.storage_status()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.storage_dashboard_description()}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Sheet.Root>
					<Sheet.Trigger>
						<Button>
							<TerminalSquareIcon />
						</Button>
					</Sheet.Trigger>
					<Sheet.Content class="min-w-[77vw] overflow-auto p-8">
						<RookCephViewer {cluster} />
					</Sheet.Content>
				</Sheet.Root>
			</Item.Actions>
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
				<Tabs.Content value="overview">
					{#key dashboardTimeRangeKey}
						<Overview
							client={prometheusDriver}
							{cluster}
							{start}
							{end}
							endIsNow={pickerToIsNow}
							bind:isReloading
						/>
					{/key}
				</Tabs.Content>
				<Tabs.Content value="analytics">
					<!-- <Analytics client={prometheusDriver} {cluster} /> -->
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</div>
