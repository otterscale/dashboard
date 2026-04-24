<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import { default as CPUAverageChart } from './area-chart-cpu.svelte';
	import { default as DiskChart } from './area-chart-disk.svelte';
	import { default as NetworkChart } from './area-chart-network.svelte';
	import { default as RAMChart } from './area-chart-ram.svelte';
	import { default as UptimeChart } from './text-chart-uptime.svelte';
	import { default as UsageRateCPU } from './usage-rate-chart-cpu.svelte';
	import { default as UsageRateMemoryUsage } from './usage-rate-chart-memory-usage.svelte';
	import { default as UsageRateRAM } from './usage-rate-chart-ram.svelte';

	let {
		client,
		namespace,
		selectedVM = $bindable()
	}: {
		client: PrometheusDriver;
		namespace: string | undefined;
		selectedVM: string | undefined;
	} = $props();

	const vmFilter = $derived(selectedVM ?? '__no_vm__');
</script>

<div class="flex flex-col gap-4">
	{#key `${namespace ?? ''}-${vmFilter}`}
		<div class="grid w-full gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
			<span class="col-span-1">
				<UptimeChart {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<UsageRateCPU {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<UsageRateRAM {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<UsageRateMemoryUsage {client} vmName={vmFilter} />
			</span>
		</div>

		<div class="grid w-full gap-4 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2">
			<span class="col-span-1">
				<CPUAverageChart {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<RAMChart {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<NetworkChart {client} vmName={vmFilter} />
			</span>
			<span class="col-span-1">
				<DiskChart {client} vmName={vmFilter} />
			</span>
		</div>
	{/key}
</div>
