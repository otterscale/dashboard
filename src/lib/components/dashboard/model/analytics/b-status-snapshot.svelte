<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
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
	let restartByPod = $state<PodEntry[]>([]);
	let oomByPod = $state<PodEntry[]>([]);
	let terminatedByPod = $state<Record<string, TerminatedInfo>>({});
	let xidByGpu = $state<GpuEntry[]>([]);
	let nodeCount = $state(0);
	let isLoaded = $state(false);

	function modelJoin(): string {
		return `* on(namespace, pod) group_left() group by(namespace, pod) (${vllmMetricWithSelector(
			'vllm:kv_cache_usage_perc',
			namespace,
			selectedModel
		)})`;
	}

	function containerSelector(extra = ''): string {
		const ns = (namespace ?? '').trim();
		const parts = ['container="main"'];
		if (ns) parts.unshift(`namespace="${escapePromqlStringLiteral(ns)}"`);
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

		const mainQueries = {
			restartTotal: `sum(increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join})`,
			restartPerPod: `sum by(pod) (increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join}) > 0`,
			oomTotal: `sum(increase(container_oom_events_total${cs}[24h]) ${join})`,
			oomPerPod: `sum by(pod) (increase(container_oom_events_total${cs}[24h]) ${join}) > 0`,
			throttle:
				`sum(rate(container_cpu_cfs_throttled_periods_total${cs}[5m]) ${join})` +
				` / sum(rate(container_cpu_cfs_periods_total${cs}[5m]) ${join}) * 100`,
			lastTermExit: `kube_pod_container_status_last_terminated_exitcode${cs} ${join}`
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
		nodeCount = nodes.length;
		xidTotal = xid.total;
		xidByGpu = xid.byGpu;
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
	const levels = $derived([restartLevel, oomLevel, xidLevel, throttleLevel, shmLevel] as const);
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
			<div class="flex h-[260px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else}
			<div class="grid h-[260px] grid-cols-2 place-content-center gap-x-2 gap-y-6">
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
