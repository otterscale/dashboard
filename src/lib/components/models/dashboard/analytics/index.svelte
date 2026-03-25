<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import ChartKvCache from './chart-kv-cache.svelte';
	import ChartRequests from './chart-requests.svelte';
	import ChartRequestsWaiting from './chart-requests-waiting.svelte';
	import ChartThroughput from './chart-throughput.svelte';
	import ChartTtft from './chart-ttft.svelte';
	import ChartTpot from './chart-tpot.svelte';

	let {
		cluster,
		namespace,
		client,
		selectedModel = $bindable(),
		isReloading = $bindable()
	}: {
		cluster: string;
		namespace: string | undefined;
		client: PrometheusDriver;
		selectedModel: string | undefined;
		isReloading?: boolean;
	} = $props();

	const modelFilter = $derived(selectedModel ?? '.*');
</script>

<div class="flex flex-col gap-4">
	{#key `${namespace ?? '__all_namespaces__'}-${modelFilter}`}
		<div class="grid w-full gap-4 lg:grid-cols-2">
			<ChartTtft
				{cluster}
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
			<ChartTpot
				{cluster}
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
			<ChartThroughput
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
			<ChartRequests
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
			<ChartRequestsWaiting
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
			<ChartKvCache
				{namespace}
				prometheusDriver={client}
				selectedModel={modelFilter}
				isReloading={isReloading ?? false}
			/>
		</div>
	{/key}
</div>
