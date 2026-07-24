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
		classifyThreshold,
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		fetchModelNodes,
		type ThresholdLevel,
		vllmMetricWithSelector
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

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

	type PodEntry = { pod: string; value: number };
	type GpuEntry = { hostname: string; gpu: string; value: number };
	type TerminatedInfo = { exitcode: number | null };

	let restartTotal = $state(0);
	let oomTotal = $state(0);
	let xidTotal = $state(0);
	let throttlePct = $state(0);
	let preemptTotal = $state(0);
	let restartByPod = $state<PodEntry[]>([]);
	let oomByPod = $state<PodEntry[]>([]);
	let preemptByPod = $state<PodEntry[]>([]);
	let terminatedByPod = $state<Record<string, TerminatedInfo>>({});
	let xidByGpu = $state<GpuEntry[]>([]);
	let nodeCount = $state(0);
	// Engine image tag(s) + key runtime config — metadata, not a health signal.
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

	function containerSelector(extra = ''): string {
		const ns = (namespace ?? '').trim();
		const parts: string[] = [];
		if (ns) parts.push(`namespace="${escapePromqlStringLiteral(ns)}"`);
		if (extra) parts.push(extra);
		return `{${parts.join(',')}}`;
	}

	function regexEscape(node: string): string {
		return node.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&');
	}

	function scalarFromVectors(vectors: { value?: { value: unknown } }[]): number {
		const raw = vectors[0]?.value?.value;
		const num = Number(raw);
		return Number.isFinite(num) ? num : 0;
	}

	function perPodFromVectors(
		vectors: { metric: { labels: object }; value?: { value: unknown } }[]
	): PodEntry[] {
		return vectors
			.map((v) => {
				const pod = (v.metric.labels as Record<string, string>).pod ?? '(unknown)';
				const value = Number(v.value?.value);
				return Number.isFinite(value) ? { pod, value } : null;
			})
			.filter((x): x is PodEntry => x !== null)
			.sort((a, b) => b.value - a.value);
	}

	// Map each pod to its last-terminated exit code (the metric value). vLLM /dev/shm
	// exhaustion surfaces here as exit 135 (SIGBUS) — distinct from OOMKilled, which is
	// the memory-limit path.
	function terminatedFromVectors(
		exitVecs: { metric: { labels: object }; value?: { value: unknown } }[]
	): Record<string, TerminatedInfo> {
		const map: Record<string, TerminatedInfo> = {};
		for (const v of exitVecs) {
			const labels = v.metric.labels as Record<string, string>;
			const pod = labels.pod;
			if (!pod) continue;
			const code = Number(v.value?.value);
			map[pod] = { exitcode: Number.isFinite(code) ? code : null };
		}
		return map;
	}

	// 135 = 128 + SIGBUS(7): writing to a full /dev/shm tmpfs faults with SIGBUS — the clearest
	// crash signature of shm exhaustion. 134/SIGABRT is intentionally excluded: it just means
	// abort() was called (CUDA/NCCL/assert/heap corruption) and rarely points to shm.
	function isShmLikely(exitcode: number | null): boolean {
		return exitcode === 135;
	}

	async function fetch() {
		const cs = containerSelector();
		const join = modelJoin();

		// Preemption + engine info are native vLLM metrics (they already carry
		// namespace/pod/llm_inference_service), so they need no kube join.
		const preempt = vllmMetricWithSelector('vllm:num_preemptions_total', namespace, selectedModel);

		const mainQueries = {
			restartTotal: `sum(increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join})`,
			restartPerPod: `sum by(pod) (increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join}) > 0`,
			oomTotal: `sum(increase(container_oom_events_total${cs}[24h]) ${join})`,
			oomPerPod: `sum by(pod) (increase(container_oom_events_total${cs}[24h]) ${join}) > 0`,
			throttle:
				`sum(rate(container_cpu_cfs_throttled_periods_total${cs}[5m]) ${join})` +
				` / sum(rate(container_cpu_cfs_periods_total${cs}[5m]) ${join}) * 100`,
			lastTermExit: `kube_pod_container_status_last_terminated_exitcode${cs} ${join}`,
			preemptTotal: `sum(increase(${preempt}[24h]))`,
			preemptPerPod: `sum by(pod) (increase(${preempt}[24h])) > 0`,
			// Engine image: pick the model's engine container via the same join the tiles use.
			engineImage: `kube_pod_container_info${cs} ${join}`,
			engineConfig: vllmMetricWithSelector('vllm:cache_config_info', namespace, selectedModel)
		};

		const nodesPromise = fetchModelNodes(prometheusDriver, namespace, selectedModel);

		// Kick off XID as soon as nodes resolves, in parallel with the main batch —
		// it only needs `nodes`, not the full set of cluster-wide queries.
		const xidPromise = nodesPromise.then(async (nodes) => {
			if (nodes.length === 0) return { total: 0, byGpu: [] as GpuEntry[] };
			const regex = escapePromqlStringLiteral(nodes.map(regexEscape).join('|'));
			const selector = `{Hostname=~"${regex}"}`;
			const xid = await fetchCombinedInstant(prometheusDriver, {
				total: `sum(increase(DCGM_FI_DEV_XID_ERRORS${selector}[24h]))`,
				perGpu: `sum by(Hostname, gpu) (increase(DCGM_FI_DEV_XID_ERRORS${selector}[24h])) > 0`
			});
			const total = Math.round(scalarFromVectors(xid.total));
			const byGpu = xid.perGpu
				.map((v) => {
					const labels = v.metric.labels as Record<string, string>;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) return null;
					return {
						hostname: labels.Hostname ?? '(unknown)',
						gpu: labels.gpu ?? '?',
						value
					};
				})
				.filter((x): x is GpuEntry => x !== null)
				.sort((a, b) => b.value - a.value);
			return { total, byGpu };
		});

		const [main, nodes, xid] = await Promise.all([
			fetchCombinedInstant(prometheusDriver, mainQueries),
			nodesPromise,
			xidPromise
		]);

		restartTotal = Math.round(scalarFromVectors(main.restartTotal));
		restartByPod = perPodFromVectors(main.restartPerPod);
		oomTotal = Math.round(scalarFromVectors(main.oomTotal));
		oomByPod = perPodFromVectors(main.oomPerPod);
		terminatedByPod = terminatedFromVectors(main.lastTermExit);
		const throttleV = scalarFromVectors(main.throttle);
		throttlePct = Number.isFinite(throttleV) ? throttleV : 0;
		preemptTotal = Math.round(scalarFromVectors(main.preemptTotal));
		preemptByPod = perPodFromVectors(main.preemptPerPod);
		engineImages = [
			...new Set(
				(main.engineImage ?? [])
					.map((v) => (v.metric.labels as Record<string, string>).image)
					.filter((s): s is string => Boolean(s))
			)
		];
		engineConfig =
			((main.engineConfig ?? [])[0]?.metric.labels as Record<string, string> | undefined) ?? {};
		nodeCount = nodes.length;
		xidTotal = xid.total;
		xidByGpu = xid.byGpu;
	}

	/** Extract the tag from an image ref, dropping any `@sha256:…` digest. */
	function imageTag(image: string): string {
		const noDigest = image.includes('@') ? image.slice(0, image.indexOf('@')) : image;
		const lastSlash = noDigest.lastIndexOf('/');
		const lastPart = lastSlash >= 0 ? noDigest.slice(lastSlash + 1) : noDigest;
		const colon = lastPart.lastIndexOf(':');
		return colon >= 0 ? lastPart.slice(colon + 1) : 'latest';
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

	const restartLevel = $derived<ThresholdLevel>(
		classifyThreshold(restartTotal, { green: 0, orange: 2 })
	);
	const oomLevel = $derived<ThresholdLevel>(oomTotal > 0 ? 'red' : 'green');
	const xidLevel = $derived<ThresholdLevel>(
		nodeCount === 0 ? 'green' : xidTotal > 0 ? 'red' : 'green'
	);
	const throttleLevel = $derived<ThresholdLevel>(
		classifyThreshold(throttlePct, { green: 5, orange: 25 })
	);
	// 0 over 24h = healthy; any preemption = KV pressure (re-prefill, TTFT spike). Thresholds tunable.
	const preemptLevel = $derived<ThresholdLevel>(
		classifyThreshold(preemptTotal, { green: 0, orange: 10 })
	);
	const engineVersion = $derived.by(() => {
		const tags = [...new Set(engineImages.map(imageTag))];
		return tags.length === 0 ? '—' : tags.join(' / ');
	});
	const engineConfigRows = $derived(
		Object.keys(engineConfig).length === 0
			? []
			: [
					{ label: m.cfg_gpu_mem_util(), value: engineConfig.gpu_memory_utilization ?? '—' },
					{ label: m.cfg_gpu_blocks(), value: engineConfig.num_gpu_blocks ?? '—' },
					{ label: m.cfg_kv_offload(), value: kvOffloadText() }
				]
	);
	// Prefix Caching (vLLM APC) — its own tile: it's the precondition for the L1 cache line.
	const prefixCacheOn = $derived(engineConfig.enable_prefix_caching === 'True');
	const prefixCacheValue = $derived(
		'enable_prefix_caching' in engineConfig ? (prefixCacheOn ? m.status_on() : m.status_off()) : '—'
	);
	// "Last died from SIGBUS" — the closest available signal to /dev/shm exhaustion.
	// No usage gauge exists for a memory-backed emptyDir, so we count the crash signature instead.
	const shmCrashPods = $derived(
		Object.entries(terminatedByPod)
			.filter(([, t]) => isShmLikely(t.exitcode))
			.map(([pod, t]) => ({ pod, exitcode: t.exitcode }))
			.sort((a, b) => a.pod.localeCompare(b.pod))
	);
	const shmCrashCount = $derived(shmCrashPods.length);
	const shmLevel = $derived<ThresholdLevel>(shmCrashCount > 0 ? 'red' : 'green');

	const severityRank = { green: 0, orange: 1, red: 2 } as const;
	const levels = $derived([
		restartLevel,
		oomLevel,
		xidLevel,
		throttleLevel,
		shmLevel,
		preemptLevel
	] as const);
	const overallLevel = $derived<ThresholdLevel>(
		levels.reduce<ThresholdLevel>(
			(acc, lvl) => (severityRank[lvl] > severityRank[acc] ? lvl : acc),
			'green'
		)
	);
	const issueCount = $derived(levels.filter((l) => l === 'red').length);
	const warningCount = $derived(levels.filter((l) => l === 'orange').length);

	function valueColorClass(level: ThresholdLevel): string {
		if (level === 'red') return 'text-destructive';
		if (level === 'orange') return 'text-chart-1';
		return 'text-chart-2';
	}
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.pod_hardware_status()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.llm_dashboard_pod_hardware_status_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_pod_hardware_status_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-65 w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else}
			<div class="grid h-65 grid-cols-3 place-content-center gap-x-2 gap-y-6">
				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p
								class={cn('max-w-full truncate text-2xl font-bold', valueColorClass('green'))}
								title={engineVersion}
							>
								{engineVersion}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_engine()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-sm">
						{#if engineImages.length === 0 && engineConfigRows.length === 0}
							<p class="text-xs">{m.no_data_display()}</p>
						{:else}
							<div class="flex flex-col gap-1 text-xs">
								{#each engineImages as img (img)}
									<div class="flex items-center gap-3">
										<span class="text-muted-foreground">{m.engine_image()}</span>
										<span class="ml-auto font-mono break-all">{img}</span>
									</div>
								{/each}
								{#if engineConfigRows.length > 0}
									<ul class="mt-1 flex flex-col gap-1 border-t pt-2">
										{#each engineConfigRows as row (row.label)}
											<li class="flex items-center gap-3">
												<span class="text-muted-foreground">{row.label}</span>
												<span class="ml-auto font-mono tabular-nums">{row.value}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p
								class={cn(
									'text-3xl font-bold',
									prefixCacheOn ? valueColorClass('green') : 'text-muted-foreground'
								)}
							>
								{prefixCacheValue}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.cfg_prefix_caching()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-xs">
						<p class="text-xs">{m.llm_dashboard_prefix_caching_hint()}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(restartLevel))}>
								{restartTotal}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_restart()}
							</p>
						</div>
					</Tooltip.Trigger>
					{#if restartByPod.length > 0}
						<Tooltip.Content side="bottom">
							<ul class="flex flex-col gap-1 text-xs">
								{#each restartByPod as p (p.pod)}
									<li class="flex items-center gap-3">
										<span class="truncate" title={p.pod}>{p.pod}</span>
										<span class="ml-auto font-mono tabular-nums">{Math.round(p.value)}</span>
									</li>
								{/each}
							</ul>
						</Tooltip.Content>
					{/if}
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(oomLevel))}>
								{oomTotal}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_oom()}
							</p>
						</div>
					</Tooltip.Trigger>
					{#if oomByPod.length > 0}
						<Tooltip.Content side="bottom">
							<ul class="flex flex-col gap-1 text-xs">
								{#each oomByPod as p (p.pod)}
									<li class="flex items-center gap-3">
										<span class="truncate" title={p.pod}>{p.pod}</span>
										<span class="ml-auto font-mono tabular-nums">{Math.round(p.value)}</span>
									</li>
								{/each}
							</ul>
						</Tooltip.Content>
					{/if}
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(xidLevel))}>
								{nodeCount === 0 ? '—' : xidTotal}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_xid()}
							</p>
						</div>
					</Tooltip.Trigger>
					{#if nodeCount === 0}
						<Tooltip.Content side="bottom">
							<p class="text-xs">{m.no_gpu_for_model()}</p>
						</Tooltip.Content>
					{:else if xidByGpu.length > 0}
						<Tooltip.Content side="bottom">
							<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
								{#each xidByGpu as g (g.hostname + g.gpu)}
									<li class="flex items-center gap-2">
										<span class="truncate" title={g.hostname}>{g.hostname}</span>
										<span class="text-muted-foreground">GPU{g.gpu}</span>
										<span class="ml-auto font-mono tabular-nums">{Math.round(g.value)}</span>
									</li>
								{/each}
							</ul>
						</Tooltip.Content>
					{/if}
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(throttleLevel))}>
								{throttlePct.toFixed(1)}%
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_cpu_throttle()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-xs">
						<p class="text-xs">{m.llm_dashboard_cpu_throttle_hint()}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(shmLevel))}>
								{shmCrashCount}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_shm_crash()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-sm">
						{#if shmCrashPods.length === 0}
							<p class="text-xs">{m.llm_dashboard_shm_crash_hint()}</p>
						{:else}
							<div class="flex flex-col gap-1">
								<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
									{#each shmCrashPods as p (p.pod)}
										<li class="flex items-center gap-3">
											<span class="truncate" title={p.pod}>{p.pod}</span>
											<span class="ml-auto font-mono tabular-nums">exit {p.exitcode}</span>
										</li>
									{/each}
								</ul>
								<p class="mt-1 border-t pt-2 text-[0.7rem] leading-snug">
									{m.llm_dashboard_shm_crash_hint()}
								</p>
							</div>
						{/if}
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<div class="flex flex-col items-center gap-1">
							<p class={cn('text-3xl font-bold', valueColorClass(preemptLevel))}>
								{preemptTotal}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_preempt()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-xs">
						{#if preemptByPod.length === 0}
							<p class="text-xs">{m.llm_dashboard_preempt_hint()}</p>
						{:else}
							<div class="flex flex-col gap-1">
								<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
									{#each preemptByPod as p (p.pod)}
										<li class="flex items-center gap-3">
											<span class="truncate" title={p.pod}>{p.pod}</span>
											<span class="ml-auto font-mono tabular-nums">{Math.round(p.value)}</span>
										</li>
									{/each}
								</ul>
								<p class="mt-1 border-t pt-2 text-[0.7rem] leading-snug">
									{m.llm_dashboard_preempt_hint()}
								</p>
							</div>
						{/if}
					</Tooltip.Content>
				</Tooltip.Root>

				<div class="flex flex-col items-center gap-1">
					<p class={cn('text-3xl font-bold', valueColorClass(overallLevel))}>
						{#if overallLevel === 'green'}
							{m.status_ok()}
						{:else}
							{issueCount + warningCount}
						{/if}
					</p>
					<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
						{m.metric_overall_status()}
					</p>
				</div>
			</div>
		{/if}
	</Statistics.Content>
</Statistics.Root>
