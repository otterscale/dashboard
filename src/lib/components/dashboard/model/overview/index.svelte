<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import E2ELatency from './e2e-latency.svelte';
	import FinishReason from './finish-reason.svelte';
	import KvCache from './kv-cache.svelte';
	import Model from './model.svelte';
	import QueueDepth from './queue-depth.svelte';
	import SuccessRate from './success-rate.svelte';
	import Throughput from './throughput.svelte';
	import TimePerOutputToken from './time-per-output-token.svelte';
	import TimeToFirstToken from './time-to-first-token.svelte';
	import VGPU from './vgpu.svelte';

	let {
		prometheusDriver,
		cluster,
		namespace,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();
</script>

{#key namespace}
	<div class="grid grid-cols-1 gap-5 pt-4 md:grid-cols-12">
		<!-- Row 1: small KPI cards, 3+3+3+3 -->
		<div class="md:col-span-3">
			<Model {prometheusDriver} {namespace} {cluster} {start} {end} {endIsNow} bind:isReloading />
		</div>
		<div class="md:col-span-3">
			<KvCache {prometheusDriver} {namespace} {cluster} {start} {end} {endIsNow} bind:isReloading />
		</div>
		<div class="md:col-span-3">
			<QueueDepth
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>
		<div class="md:col-span-3">
			<SuccessRate
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>

		<!-- Row 2: TTFT (3) + E2E Latency (3) + TimePerOutputToken (3) + Throughput (3) -->
		<div class="md:col-span-3">
			<TimeToFirstToken
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>

		<div class="md:col-span-3">
			<TimePerOutputToken
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>

		<div class="md:col-span-3">
			<E2ELatency
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>

		<div class="md:col-span-3">
			<Throughput
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>

		<!-- Row 3: Finish Reason (6) + vGPU (6) -->
		<div class="md:col-span-6">
			<FinishReason
				{prometheusDriver}
				{namespace}
				{cluster}
				{start}
				{end}
				{endIsNow}
				bind:isReloading
			/>
		</div>
		<div class="md:col-span-6">
			<VGPU {prometheusDriver} {namespace} bind:isReloading />
		</div>
	</div>
{/key}
