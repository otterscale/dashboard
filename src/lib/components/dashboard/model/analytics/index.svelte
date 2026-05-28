<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/paraglide/messages';

	import ATopKvPressure from './a-top-kv-pressure.svelte';
	import ATopP99Latency from './a-top-p99-latency.svelte';
	import ATopThroughput from './a-top-throughput.svelte';
	import BGpuMemory from './b-gpu-memory.svelte';
	import BMemoryUsage from './b-memory-usage.svelte';
	import BStatusSnapshot from './b-status-snapshot.svelte';
	import CGenerationSizeHeatmap from './c-generation-size-heatmap.svelte';
	import CPrefillDecode from './c-prefill-decode.svelte';
	import CPrefixCacheHit from './c-prefix-cache-hit.svelte';
	import CPromptSizeHeatmap from './c-prompt-size-heatmap.svelte';
	import CTokensPerReplica from './c-tokens-per-replica.svelte';
	import DActiveRequests from './d-active-requests.svelte';
	import DKvCache from './d-kv-cache.svelte';
	import DThroughput from './d-throughput.svelte';
	import DTimePerOutputToken from './d-time-per-output-token.svelte';
	import DTimeToFirstToken from './d-time-to-first-token.svelte';
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
					<BStatusSnapshot
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						isReloading={isReloading ?? false}
					/>
					<BMemoryUsage
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<BGpuMemory
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
					<DTimeToFirstToken
						{cluster}
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<DTimePerOutputToken
						{cluster}
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<DActiveRequests
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<DKvCache
						{namespace}
						prometheusDriver={client}
						selectedModel={modelFilter}
						{start}
						{end}
						{endIsNow}
						isReloading={isReloading ?? false}
					/>
					<div class="lg:col-span-2">
						<DThroughput
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
