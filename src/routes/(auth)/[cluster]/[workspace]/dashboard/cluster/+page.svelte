<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import { Dashboard } from '$lib/components/dashboard/cluster/analytics';
	import InstancePicker from '$lib/components/dashboard/cluster/analytics/instance-picker.svelte';
	import { widgets } from '$lib/components/dashboard/cluster/overview/widgets';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.cluster_status(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/cluster', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster!);

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let selectedTab = $state('overview');
	/** Node / instance filter for analytics; aligned with Reloader like model dashboard ModelPicker */
	let selectedInstance = $state<string | undefined>(undefined);

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

{#key cluster}
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
								class="flex min-h-9 min-w-[11rem] shrink-0 items-center justify-end sm:min-w-[12rem] {selectedTab !==
								'analytics'
									? 'pointer-events-none invisible select-none'
									: ''}"
								aria-hidden={selectedTab !== 'analytics'}
							>
								<InstancePicker {prometheusDriver} bind:selectedInstance />
							</div>
							<Reloader bind:checked={isReloading} />
						</div>
					</div>
					<Tabs.Content value="overview">
						<div
							class="grid auto-rows-[minmax(140px,auto)] grid-cols-2 gap-4 pt-4 md:gap-6 lg:grid-cols-1 2xl:grid-cols-4"
						>
							<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
						</div>
					</Tabs.Content>
					<Tabs.Content value="analytics">
						<Dashboard {cluster} client={prometheusDriver} bind:selectedInstance />
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
{/key}
