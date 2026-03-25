<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import Icon from '@iconify/svelte';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import { Dashboard } from '$lib/components/models/dashboard/analytics';
	import { Overview } from '$lib/components/models/dashboard/overview/index';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	let { cluster, namespace }: { cluster: string; namespace: string } = $props();

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

<main class="space-y-4 py-4">
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<div class="grid gap-1">
				<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.dashboard()}</h1>
				<p class="text-muted-foreground">
					{m.llm_dashboard_description()}
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
					<Overview {prometheusDriver} {namespace} {cluster} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics">
					<Dashboard {cluster} {namespace} client={prometheusDriver} bind:isReloading />
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{:else if cluster}
		<div class="flex min-h-[400px] w-full items-center justify-center">
			<Icon icon="svg-spinners:6-dots-rotate" class="size-12 text-muted-foreground" />
		</div>
	{:else}
		<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
			<p>{m.no_data_display()}</p>
		</div>
	{/if}
</main>
