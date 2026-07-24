<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/messages';

	import CTokenSizeDistribution from './c-token-size-distribution.svelte';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();
</script>

<CTokenSizeDistribution
	title={m.prompt_size_distribution()}
	description={m.llm_dashboard_prompt_size_description()}
	tooltip={m.llm_dashboard_prompt_size_tooltip()}
	bucketMetric="vllm:request_prompt_tokens_bucket"
	{prometheusDriver}
	{namespace}
	{selectedModel}
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>
