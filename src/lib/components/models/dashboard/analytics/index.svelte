<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import ChartKvCache from './chart-kv-cache.svelte';
	import ChartRequests from './chart-requests.svelte';
	import ChartRequestsWaiting from './chart-requests-waiting.svelte';
	import ChartThroughput from './chart-throughput.svelte';
	import ChartTtft from './chart-ttft.svelte';
	import ChartTpot from './chart-tpot.svelte';
	import ModelPicker from './model-picker.svelte';

	let {
		cluster,
		namespace,
		client,
		isReloading = $bindable()
	}: {
		cluster: string;
		namespace: string | undefined;
		client: PrometheusDriver;
		isReloading?: boolean;
	} = $props();

	let selectedModel = $state<string | undefined>(undefined);
</script>

<div class="flex flex-col gap-4">
	<div class="ml-auto flex flex-wrap items-center gap-2">
		<ModelPicker {cluster} {namespace} bind:selectedModel />
	</div>
	{#if selectedModel && namespace}
		{#key selectedModel}
			<div class="grid w-full gap-4 lg:grid-cols-2">
				<ChartTtft {cluster} {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
				<ChartTpot {cluster} {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
				<ChartThroughput {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
				<ChartRequests {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
				<ChartRequestsWaiting {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
				<ChartKvCache {namespace} prometheusDriver={client} {selectedModel} isReloading={isReloading ?? false} />
			</div>
		{/key}
	{/if}
</div>
