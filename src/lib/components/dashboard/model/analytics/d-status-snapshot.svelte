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

	let restartTotal = $state(0);
	let oomTotal = $state(0);
	let xidTotal = $state(0);
	let throttlePct = $state(0);
	let totalPods = $state(0);
	let podsWithLimit = $state(0);
	let restartByPod = $state<PodEntry[]>([]);
	let oomByPod = $state<PodEntry[]>([]);
	let xidByGpu = $state<GpuEntry[]>([]);
	let podsMissingLimit = $state<string[]>([]);
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

	async function instantNumber(query: string): Promise<number> {
		try {
			const resp = await prometheusDriver.instantQuery(query);
			const raw = resp.result[0]?.value?.value;
			const num = Number(raw);
			return Number.isFinite(num) ? num : 0;
		} catch {
			return 0;
		}
	}

	async function instantPerPod(query: string): Promise<PodEntry[]> {
		try {
			const resp = await prometheusDriver.instantQuery(query);
			return resp.result
				.map((v) => {
					const pod = (v.metric.labels as Record<string, string>).pod ?? '(unknown)';
					const value = Number(v.value?.value);
					return Number.isFinite(value) ? { pod, value } : null;
				})
				.filter((x): x is PodEntry => x !== null)
				.sort((a, b) => b.value - a.value);
		} catch {
			return [];
		}
	}

	async function instantPods(query: string): Promise<string[]> {
		try {
			const resp = await prometheusDriver.instantQuery(query);
			return resp.result
				.map((v) => (v.metric.labels as Record<string, string>).pod)
				.filter((p): p is string => Boolean(p))
				.sort();
		} catch {
			return [];
		}
	}

	async function fetch() {
		const cs = containerSelector();
		const csMem = containerSelector('resource="memory"');
		const join = modelJoin();

		const restartTotalQ = `sum(increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join})`;
		const restartPerQ = `sum by(pod) (increase(kube_pod_container_status_restarts_total${cs}[24h]) ${join}) > 0`;
		const oomTotalQ = `sum(increase(container_oom_events_total${cs}[24h]) ${join})`;
		const oomPerQ = `sum by(pod) (increase(container_oom_events_total${cs}[24h]) ${join}) > 0`;
		const throttleQ =
			`sum(rate(container_cpu_cfs_throttled_periods_total${cs}[5m]) ${join})` +
			` / sum(rate(container_cpu_cfs_periods_total${cs}[5m]) ${join}) * 100`;
		const allPodsQ = `group by(pod) (${vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, selectedModel)})`;
		const podsWithLimitQ = `group by(pod) (kube_pod_container_resource_limits${csMem} ${join})`;

		const nodesPromise = fetchModelNodes(prometheusDriver, namespace, selectedModel);

		// Kick off XID as soon as nodes resolves, in parallel with the other queries —
		// it only needs `nodes`, not the full main batch.
		const xidPromise = nodesPromise.then(async (nodes) => {
			if (nodes.length === 0) return { total: 0, byGpu: [] as GpuEntry[] };
			const regex = escapePromqlStringLiteral(nodes.map(regexEscape).join('|'));
			const selector = `{Hostname=~"${regex}"}`;
			const xidTotalQ = `sum(increase(DCGM_FI_DEV_XID_ERRORS${selector}[24h]))`;
			const xidPerQ = `sum by(Hostname, gpu) (increase(DCGM_FI_DEV_XID_ERRORS${selector}[24h])) > 0`;
			try {
				const [totalResp, perResp] = await Promise.all([
					prometheusDriver.instantQuery(xidTotalQ),
					prometheusDriver.instantQuery(xidPerQ)
				]);
				const raw = totalResp.result[0]?.value?.value;
				const num = Number(raw);
				const total = Number.isFinite(num) ? Math.round(num) : 0;
				const byGpu = perResp.result
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
			} catch {
				return { total: 0, byGpu: [] as GpuEntry[] };
			}
		});

		const [
			restartTotalV,
			restartPerV,
			oomTotalV,
			oomPerV,
			throttleV,
			allPodsV,
			podsWithLimitV,
			nodes,
			xid
		] = await Promise.all([
			instantNumber(restartTotalQ),
			instantPerPod(restartPerQ),
			instantNumber(oomTotalQ),
			instantPerPod(oomPerQ),
			instantNumber(throttleQ),
			instantPods(allPodsQ),
			instantPods(podsWithLimitQ),
			nodesPromise,
			xidPromise
		]);

		restartTotal = Math.round(restartTotalV);
		restartByPod = restartPerV;
		oomTotal = Math.round(oomTotalV);
		oomByPod = oomPerV;
		throttlePct = Number.isFinite(throttleV) ? throttleV : 0;
		totalPods = allPodsV.length;
		podsWithLimit = podsWithLimitV.length;
		const withLimitSet = new Set(podsWithLimitV);
		podsMissingLimit = allPodsV.filter((p) => !withLimitSet.has(p));
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
	const missingLimitCount = $derived(Math.max(0, totalPods - podsWithLimit));
	const limitLevel = $derived<ThresholdLevel>(
		totalPods === 0 ? 'green' : missingLimitCount > 0 ? 'orange' : 'green'
	);

	const severityRank = { green: 0, orange: 1, red: 2 } as const;
	const levels = $derived([restartLevel, oomLevel, xidLevel, throttleLevel, limitLevel] as const);
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
							<p class={cn('text-3xl font-bold', valueColorClass(limitLevel))}>
								{#if totalPods === 0}
									—
								{:else if missingLimitCount > 0}
									{missingLimitCount}
								{:else}
									{m.metric_limit_ok()}
								{/if}
							</p>
							<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
								{m.metric_memory_limit()}
							</p>
						</div>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom" class="max-w-xs">
						{#if totalPods === 0}
							<p class="text-xs">{m.no_data_display()}</p>
						{:else if missingLimitCount === 0}
							<p class="text-xs">{m.llm_dashboard_memory_limit_all_set_hint()}</p>
						{:else}
							<div class="flex flex-col gap-1">
								<p class="text-xs">{m.llm_dashboard_memory_limit_missing_hint()}</p>
								<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
									{#each podsMissingLimit as pod (pod)}
										<li class="truncate" title={pod}>{pod}</li>
									{/each}
								</ul>
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
