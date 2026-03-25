<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { LoaderCircle } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import { Dashboard } from '$lib/components/dashbaord/cluster/analytics';
	import { widgets } from '$lib/components/dashbaord/cluster/overview/widgets';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	breadcrumbs.set([
		{
			title: m.cluster(),
			url: resolve('/(auth)/[cluster]/overview', { cluster: page.params.cluster! })
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let selectedTab = $state('overview');

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
	<main class="space-y-4 py-4">
		{#if prometheusDriver}
			<div class="mx-auto grid w-full gap-6">
				<div class="grid gap-1">
					<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.k8s_overview_title()}</h1>
					<p class="text-muted-foreground">
						{m.k8s_overview_description()}
					</p>
				</div>
				<Tabs.Root bind:value={selectedTab}>
					<div class="flex justify-between gap-2">
						<Tabs.List>
							<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
							<Tabs.Trigger value="analytics">{m.analytics()}</Tabs.Trigger>
						</Tabs.List>
						<Reloader bind:checked={isReloading} />
					</div>
					<Tabs.Content value="overview">
						<div
							class="grid auto-rows-[minmax(140px,auto)] grid-cols-2 gap-4 pt-4 md:gap-6 lg:grid-cols-1 2xl:grid-cols-4"
						>
							<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
						</div>
					</Tabs.Content>
					<Tabs.Content value="analytics">
						<Dashboard {cluster} client={prometheusDriver} />
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
	</main>
{/key}
