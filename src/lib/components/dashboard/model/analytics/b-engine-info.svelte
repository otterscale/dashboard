<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import {
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		vllmMetricWithSelector
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		isReloading: boolean;
	} = $props();

	// Engine image tag(s) + key runtime config — metadata, not a health signal. The
	// health tiles live in `b-pod-health.svelte`; this card is what a tuning change
	// should be checked against ("did the new gpu_memory_utilization actually land?").
	let engineImages = $state<string[]>([]);
	let engineConfig = $state<Record<string, string>>({});
	let isLoaded = $state(false);

	// Join on `container` too so the model container is picked by the vLLM metric's own
	// `container` label (KServe names it `main`, a raw vLLM Deployment names it `vllm`, etc.).
	// This also drops pod sidecars (istio/queue-proxy), which never emit vLLM metrics.
	function modelJoin(): string {
		return `* on(namespace, pod, container) group_left() group by(namespace, pod, container) (${vllmMetricWithSelector(
			'vllm:kv_cache_usage_perc',
			namespace,
			selectedModel
		)})`;
	}

	function containerSelector(): string {
		const ns = (namespace ?? '').trim();
		return ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
	}

	async function fetch() {
		const result = await fetchCombinedInstant(prometheusDriver, {
			// Engine image: pick the model's engine container via the same join the health tiles use.
			engineImage: `kube_pod_container_info${containerSelector()} ${modelJoin()}`,
			engineConfig: vllmMetricWithSelector('vllm:cache_config_info', namespace, selectedModel)
		});
		engineImages = [
			...new Set(
				(result.engineImage ?? [])
					.map((v) => (v.metric.labels as Record<string, string>).image)
					.filter((s): s is string => Boolean(s))
			)
		];
		engineConfig =
			((result.engineConfig ?? [])[0]?.metric.labels as Record<string, string> | undefined) ?? {};
	}

	/** Extract the tag from an image ref, dropping any `@sha256:…` digest. */
	function imageTag(image: string): string {
		const noDigest = image.includes('@') ? image.slice(0, image.indexOf('@')) : image;
		const lastSlash = noDigest.lastIndexOf('/');
		const lastPart = lastSlash >= 0 ? noDigest.slice(lastSlash + 1) : noDigest;
		const colon = lastPart.lastIndexOf(':');
		return colon >= 0 ? lastPart.slice(colon + 1) : 'latest';
	}

	/**
	 * Strip the tag and digest from an image ref: the Engine row already shows the tag, so
	 * repeating it here only makes the line longer. The full ref stays on hover.
	 */
	function imageRepo(image: string): string {
		const noDigest = image.includes('@') ? image.slice(0, image.indexOf('@')) : image;
		const lastSlash = noDigest.lastIndexOf('/');
		const colon = noDigest.lastIndexOf(':');
		return colon > lastSlash ? noDigest.slice(0, colon) : noDigest;
	}

	function kvOffloadText(): string {
		const backend = engineConfig.kv_offloading_backend ?? '—';
		const gb = engineConfig.cpu_offload_gb;
		return gb && gb !== '0' ? `${backend} (${gb} GB)` : backend;
	}

	const reloadManager = new ReloadManager(fetch);

	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const hasData = $derived(engineImages.length > 0 || Object.keys(engineConfig).length > 0);
	const engineVersion = $derived.by(() => {
		const tags = [...new Set(engineImages.map(imageTag))];
		return tags.length === 0 ? '—' : tags.join(' / ');
	});
	const imageText = $derived(
		engineImages.length === 0 ? '—' : [...new Set(engineImages.map(imageRepo))].join(', ')
	);
	const imageTitle = $derived(engineImages.join('\n'));
	// Prefix Caching (vLLM APC) — shown as a status pill: it's the precondition for the L1 cache line.
	const prefixCacheKnown = $derived('enable_prefix_caching' in engineConfig);
	const prefixCacheOn = $derived(engineConfig.enable_prefix_caching === 'True');
	const configRows = $derived([
		{ label: m.cfg_gpu_mem_util(), value: engineConfig.gpu_memory_utilization ?? '—' },
		{ label: m.cfg_gpu_blocks(), value: engineConfig.num_gpu_blocks ?? '—' },
		{ label: m.cfg_block_size(), value: engineConfig.block_size ?? '—' },
		{ label: m.cfg_kv_offload(), value: kvOffloadText() }
	]);
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Statistics.Title class="truncate text-base leading-normal text-foreground">
				{m.engine_config()}
			</Statistics.Title>
			<p class="truncate text-sm text-muted-foreground">
				{m.llm_dashboard_engine_config_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
				<InfoIcon class="size-4 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_engine_config_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-65 w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if !hasData}
			<div class="flex h-65 w-full flex-col items-center justify-center">
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<!-- A key/value list rather than big-number tiles: these are facts to read, not
			     values to compare, and a mono column keeps the tags and numbers aligned. -->
			<dl class="flex h-65 flex-col justify-start divide-y text-sm">
				<div class="flex items-center gap-3 py-1.5">
					<dt class="shrink-0 text-muted-foreground">{m.metric_engine()}</dt>
					<dd class="ml-auto min-w-0 truncate font-mono" title={engineVersion}>
						{engineVersion}
					</dd>
				</div>
				<div class="flex items-center gap-3 py-1.5">
					<dt class="shrink-0 text-muted-foreground">{m.engine_image()}</dt>
					<dd class="ml-auto min-w-0 truncate font-mono" title={imageTitle}>
						{imageText}
					</dd>
				</div>
				<div class="flex items-center gap-3 py-1.5">
					<dt class="shrink-0 text-muted-foreground">{m.cfg_prefix_caching()}</dt>
					<dd class="ml-auto">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<span {...props} class="cursor-help font-mono">
										{#if !prefixCacheKnown}
											—
										{:else}
											{prefixCacheOn ? m.status_on() : m.status_off()}
										{/if}
									</span>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom" class="max-w-xs">
								<p class="text-xs">{m.llm_dashboard_prefix_caching_hint()}</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</dd>
				</div>
				{#each configRows as row (row.label)}
					<div class="flex items-center gap-3 py-1.5">
						<dt class="shrink-0 text-muted-foreground">{row.label}</dt>
						<dd class="ml-auto min-w-0 truncate font-mono tabular-nums" title={row.value}>
							{row.value}
						</dd>
					</div>
				{/each}
			</dl>
		{/if}
	</Statistics.Content>
</Statistics.Root>
