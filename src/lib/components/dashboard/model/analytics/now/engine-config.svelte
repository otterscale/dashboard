<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { Panel } from '$lib/components/dashboard/kit';
	import { fetchInstant } from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	import { DASH } from '../../overview/lib/models';
	import type { ModelPods } from '../lib/model-pods';
	import { argValue, engineVersion, fmtContextTokens, imageText, shortGpuName } from '../lib/pods';
	import { engineConfigQueries } from '../lib/queries';

	// The engine and how it is set up: the version and image from the pod spec, parallelism and
	// context length from the engine's arguments, the cache settings from vLLM's own info metric.
	let {
		client,
		modelKey,
		tick,
		model,
		modelState
	}: {
		client: PrometheusDriver;
		modelKey: string;
		tick: number;
		model: ModelPods | undefined;
		modelState: 'loading' | 'ready' | 'error';
	} = $props();

	type Config = { cache: Record<string, string>; tiers: string[] };

	const loader = new Loader<Config>(async () => {
		const r = await fetchInstant(client, engineConfigQueries(modelKey));
		if (!r) return null;
		return {
			cache: r.cache[0]?.labels ?? {},
			tiers: [...new Set(r.offload.map((s) => s.labels.tier).filter(Boolean))].sort()
		};
	});
	$effect(() => {
		void tick;
		untrack(() => loader.load());
	});

	const pod = $derived(
		model?.pods.find((p) => p.status.key === 'running' && p.image) ??
			model?.pods.find((p) => p.image)
	);
	const cache = $derived(loader.data?.cache ?? {});

	/** `native · CPU 108 GiB + AidaptivSsdTier`; Off when no offload size is set. */
	function offloadText(): string {
		const size = cache.kv_offloading_size;
		if (!('kv_offloading_backend' in cache)) return DASH;
		if (!size || size === 'None') return m.status_off();
		const gib = Number(size);
		const tiers = (loader.data?.tiers ?? [])
			.map((t) => t.replace(/^\d+:/, ''))
			.filter((t) => t !== 'primary');
		const parts = [
			cache.kv_offloading_backend,
			`CPU ${Number.isFinite(gib) ? gib.toLocaleString('en-US') : size} GiB${tiers.length ? ` + ${tiers.join(' + ')}` : ''}`
		];
		return parts.join(' · ');
	}

	function blocksText(): string {
		const blocks = Number(cache.num_gpu_blocks);
		const size = cache.block_size;
		if (!Number.isFinite(blocks) || !size) return DASH;
		return m.model_analytics_kv_blocks({ blocks: blocks.toLocaleString('en-US'), size });
	}

	function gpusText(): string {
		if (!pod?.gpus) return DASH;
		const name = shortGpuName(pod.gpuType);
		return name ? `${pod.gpus} × ${name}` : String(pod.gpus);
	}

	const rows = $derived([
		{ label: m.model_analytics_engine(), value: engineVersion(pod?.image) ?? DASH },
		{ label: m.model_analytics_image(), value: imageText(pod?.image) ?? DASH },
		{
			label: m.model_analytics_tensor_parallel(),
			// vLLM's default is one GPU per replica's model copy.
			value: pod ? (argValue(pod.argv, '--tensor-parallel-size', '-tp') ?? '1') : DASH
		},
		{ label: m.model_analytics_gpus_per_replica(), value: gpusText() },
		{
			label: m.model_analytics_max_model_len(),
			value: (pod && fmtContextTokens(argValue(pod.argv, '--max-model-len'))) ?? DASH
		},
		{
			label: m.model_analytics_prefix_caching(),
			value:
				cache.enable_prefix_caching === undefined
					? DASH
					: cache.enable_prefix_caching === 'True'
						? m.status_on()
						: m.status_off()
		},
		{
			label: m.model_analytics_gpu_mem_util(),
			value: cache.gpu_memory_utilization ? Number(cache.gpu_memory_utilization).toFixed(2) : DASH
		},
		{ label: m.model_analytics_kv_cache_blocks(), value: blocksText() },
		{ label: m.model_analytics_kv_offload(), value: offloadText() }
	]);

	const loading = $derived(modelState === 'loading' || loader.state === 'loading');
</script>

<Panel
	title={m.model_analytics_engine_config()}
	state={modelState === 'error' && loader.state === 'error' ? 'error' : 'ready'}
	class="h-full"
>
	<!-- Two columns, filled left to right then down, 36px rows: five rows, as tall as Health. -->
	<dl class="grid grid-cols-2 gap-x-8 text-[0.8125rem]">
		{#each rows as row (row.label)}
			<div class="flex h-9 min-w-0 items-center gap-3 border-b">
				<dt class="shrink-0 text-muted-foreground">{row.label}</dt>
				<dd class="ml-auto min-w-0 truncate text-right font-mono text-[0.78rem] tabular-nums">
					{#if loading}
						<Skeleton class="h-3 w-24" />
					{:else}
						{row.value}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</Panel>
