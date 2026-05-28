<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/paraglide/messages';

	import ATopKvPressure from './a-top-kv-pressure.svelte';
	import ATopP99Latency from './a-top-p99-latency.svelte';
	import ATopThroughput from './a-top-throughput.svelte';
	import CGenerationSizeHeatmap from './c-generation-size-heatmap.svelte';
	import CPrefillDecode from './c-prefill-decode.svelte';
	import CPrefixCacheHit from './c-prefix-cache-hit.svelte';
	import CPromptSizeHeatmap from './c-prompt-size-heatmap.svelte';
	import CTokensPerReplica from './c-tokens-per-replica.svelte';
	import ChartActiveRequests from './chart-active-requests.svelte';
	import ChartKvCache from './chart-kv-cache.svelte';
	import ChartThroughput from './chart-throughput.svelte';
	import ChartTpot from './chart-tpot.svelte';
	import ChartTtft from './chart-ttft.svelte';
	import DGpuMemory from './d-gpu-memory.svelte';
	import DMemoryUsage from './d-memory-usage.svelte';
	import DStatusSnapshot from './d-status-snapshot.svelte';
	import PlaceholderCard from './placeholder-card.svelte';

	let {
		cluster,
		namespace,
		client,
		selectedModel = $bindable(),
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		cluster: string;
		namespace: string | undefined;
		client: PrometheusDriver;
		selectedModel: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const modelFilter = $derived(selectedModel ?? '.*');
	const hasModelSelected = $derived(modelFilter !== '.*');

	function selectModel(model: string) {
		selectedModel = model;
	}
</script>

<div class="flex flex-col gap-6 pt-4">
	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">{m.section_model_comparison()}</h2>
		<div class="grid w-full gap-4 lg:grid-cols-3">
			<ATopThroughput
				prometheusDriver={client}
				{namespace}
				isReloading={isReloading ?? false}
				onModelClick={selectModel}
			/>
			<ATopKvPressure
				prometheusDriver={client}
				{namespace}
				isReloading={isReloading ?? false}
				onModelClick={selectModel}
			/>
			<ATopP99Latency
				prometheusDriver={client}
				{namespace}
				isReloading={isReloading ?? false}
				onModelClick={selectModel}
			/>
		</div>
	</section>

	{#key modelFilter}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_pod_hardware()}</h2>
			{#if !hasModelSelected}
				<PlaceholderCard
					title={m.section_pod_hardware()}
					message={m.select_model_to_view_details()}
				/>
			{:else}
				<div class="grid w-full items-start gap-4 lg:grid-cols-3">
					<DStatusSnapshot
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						isReloading={isReloading ?? false}
					/>
					<DMemoryUsage
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<DGpuMemory
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_tuning_decision()}</h2>
			{#if !hasModelSelected}
				<PlaceholderCard
					title={m.section_tuning_decision()}
					message={m.select_model_to_view_details()}
				/>
			{:else}
				<div class="grid w-full items-start gap-4 lg:grid-cols-2">
					<CPrefillDecode
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<CPrefixCacheHit
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<CPromptSizeHeatmap
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<CGenerationSizeHeatmap
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<div class="lg:col-span-2">
						<CTokensPerReplica
							{namespace}
							prometheusDriver={client}
							selectedModel={modelFilter}
							{start}
							{end}
							{endIsNow}
							isReloading={isReloading ?? false}
						/>
					</div>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_model_detail()}</h2>
			{#if !hasModelSelected}
				<PlaceholderCard
					title={m.section_model_detail()}
					message={m.select_model_to_view_details()}
				/>
			{:else}
				<div class="grid w-full items-start gap-4 lg:grid-cols-2">
					<ChartTtft
						{cluster}
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<ChartTpot
						{cluster}
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<ChartActiveRequests
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<ChartKvCache
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<div class="lg:col-span-2">
						<ChartThroughput
							{namespace}
							prometheusDriver={client}
							selectedModel={modelFilter}
							{start}
							{end}
							{endIsNow}
							isReloading={isReloading ?? false}
						/>
					</div>
				</div>
			{/if}
		</section>
	{/key}
</div>
