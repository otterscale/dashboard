<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	import Controller from './overview/controller.svelte';
	import CPU from './overview/cpu.svelte';
	import Instance from './overview/instance.svelte';
	import Memory from './overview/memory.svelte';
	import NetworkTraffic from './overview/network-traffic.svelte';
	import ThroughtPut from './overview/throughput.svelte';
	import Pod from './overview/virtual-machine.svelte';
	import Worker from './overview/worker.svelte';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);

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
					{m.compute_dashboard_description()}
				</p>
			</div>

			<Tabs.Root value="overview">
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" disabled>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<Reloader bind:checked={isReloading} />
				</div>
				<Tabs.Content
					value="overview"
					class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-12"
				>
					<div class="col-span-2">
						<Controller {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-2">
						<Worker {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-4 row-span-2">
						<CPU {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-4 row-span-2">
						<Memory {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-2 col-start-1">
						<Pod {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-2">
						<Instance {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-6">
						<NetworkTraffic {prometheusDriver} {cluster} bind:isReloading />
					</div>
					<div class="col-span-6">
						<ThroughtPut {prometheusDriver} {cluster} bind:isReloading />
					</div>
				</Tabs.Content>
				<Tabs.Content value="analytics"></Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</main>
