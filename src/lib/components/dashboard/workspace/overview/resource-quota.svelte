<script lang="ts">
	import InfinityIcon from '@lucide/svelte/icons/infinity';
	import { type PrometheusDriver, ResponseType } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import Band from '$lib/components/dashboard/shared/band.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import Segmented from '$lib/components/dashboard/shared/segmented.svelte';
	import { usageTone } from '$lib/components/dashboard/shared/tone';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { formatCapacity, formatPercentage } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, LIVE_PODS } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { resourceQuotaPresence } from './resource-quota';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		isReloading: boolean;
	} = $props();

	const UNLIMITED = '∞';

	/**
	 * No ResourceQuota exists for the namespace (the workspace was created without
	 * `spec.resourceQuota.hard`), so `kube_resourcequota` reports nothing at all — neither `hard`
	 * nor `used`. Detected from Prometheus on every fetch; the tile then renders `used / ∞` from
	 * pod-level requests/limits instead of a ratio.
	 */
	let quotaUnlimited = $state(false);

	/** Which ResourceQuota resource keys to visualize (requests.* vs limits.*). */
	let quotaView = $state<'requests' | 'limits'>('requests');

	let cpuUsedReq = $state<number | null>(null);
	let cpuHardReq = $state<number | null>(null);
	let cpuUsedLim = $state<number | null>(null);
	let cpuHardLim = $state<number | null>(null);
	let memUsedReq = $state<number | null>(null);
	let memHardReq = $state<number | null>(null);
	let memUsedLim = $state<number | null>(null);
	let memHardLim = $state<number | null>(null);
	let gpuMemUsed = $state<number | null>(null);
	let gpuMemHard = $state<number | null>(null);
	let hasError = $state(false);

	const cpuUsed = $derived(quotaView === 'requests' ? cpuUsedReq : cpuUsedLim);
	const cpuHard = $derived(quotaView === 'requests' ? cpuHardReq : cpuHardLim);
	const memUsed = $derived(quotaView === 'requests' ? memUsedReq : memUsedLim);
	const memHard = $derived(quotaView === 'requests' ? memHardReq : memHardLim);

	function finiteOrNull(v: unknown): number | null {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function extractValue(raw: unknown): unknown {
		if (Array.isArray(raw) && raw.length >= 2) return raw[1];
		if (typeof raw === 'object' && raw !== null && 'value' in raw)
			return (raw as Record<string, unknown>).value;
		return raw;
	}

	function instantScalar(r: Awaited<ReturnType<PrometheusDriver['instantQuery']>>): number | null {
		const res = r.result;
		if (!Array.isArray(res) || res.length === 0) return null;

		if (r.resultType === ResponseType.SCALAR || r.resultType === ResponseType.STRING) {
			return finiteOrNull(res[1]);
		}

		const raw = (res[0] as { value?: unknown })?.value;
		return raw == null ? null : finiteOrNull(extractValue(raw));
	}

	function rqSum(resource: string, t: 'used' | 'hard') {
		const ns = escapePromqlStringLiteral(namespace);
		const base = `kube_resourcequota{namespace="${ns}"`;
		return `sum(${base}, type="${t}", resource="${resource}"})`;
	}

	/** Number of ResourceQuota series KSM exports for the namespace; empty when none exists. */
	function rqCount() {
		const ns = escapePromqlStringLiteral(namespace);
		return `count(kube_resourcequota{namespace="${ns}", type="hard"})`;
	}

	/**
	 * Liveness probe for kube-state-metrics: the namespace collector emits exactly one series per
	 * namespace, from the same scrape that produces `kube_resourcequota`. Empty means KSM is not
	 * being scraped right now (or the namespace does not exist yet).
	 */
	function nsCount() {
		const ns = escapePromqlStringLiteral(namespace);
		return `count(kube_namespace_created{namespace="${ns}"})`;
	}

	/**
	 * Pod-level stand-in for ResourceQuota's `used` counter, for namespaces that have no
	 * ResourceQuota at all. Restricted to non-terminated pods, the same set the quota counts.
	 */
	function podResourceSum(kind: 'requests' | 'limits', resource: 'cpu' | 'memory'): string {
		const nsLit = escapePromqlStringLiteral(namespace);
		const unit = resource === 'cpu' ? 'core' : 'byte';
		return (
			`sum(kube_pod_container_resource_${kind}` +
			`{namespace="${nsLit}",resource="${resource}",unit="${unit}"} ${LIVE_PODS}) or vector(0)`
		);
	}

	/** KSM `resource` label on `kube_pod_container_resource_limits` (dots → underscores). */
	const KSM_POD_RES_NVIDIA_GPU = 'nvidia_com_gpu';
	const KSM_POD_RES_NVIDIA_GPUMEM = 'nvidia_com_gpumem';

	/**
	 * gpumem (nvidia.com/gpumem) is a per-GPU value, so total used memory =
	 * sum over containers of (gpu_count × gpumem_per_gpu).
	 */
	function podContainerReadyGpuMemTotalSum(ns: string): string {
		const nsLit = escapePromqlStringLiteral(ns);
		const gpuRes = escapePromqlStringLiteral(KSM_POD_RES_NVIDIA_GPU);
		const memRes = escapePromqlStringLiteral(KSM_POD_RES_NVIDIA_GPUMEM);
		const ready = `kube_pod_container_status_ready{namespace="${nsLit}"} == 1`;
		const gpu = `kube_pod_container_resource_limits{namespace="${nsLit}",resource="${gpuRes}"}`;
		const mem = `kube_pod_container_resource_limits{namespace="${nsLit}",resource="${memRes}"}`;
		return `sum((${gpu} * on (namespace, pod, container) ${mem}) and on (namespace, pod, container) ${ready})`;
	}

	async function queryScalar(q: string): Promise<number | null> {
		try {
			const r = await prometheusDriver.instantQuery(q, new Date());
			return instantScalar(r);
		} catch {
			return null;
		}
	}

	/** No ResourceQuota to read: only the numerators exist, and they come from the pods. */
	async function fetchUnlimitedUsage() {
		const [cpuReqU, cpuLimU, memReqU, memLimU, gpuMemUsedFromPods] = await Promise.all([
			queryScalar(podResourceSum('requests', 'cpu')),
			queryScalar(podResourceSum('limits', 'cpu')),
			queryScalar(podResourceSum('requests', 'memory')),
			queryScalar(podResourceSum('limits', 'memory')),
			queryScalar(podContainerReadyGpuMemTotalSum(namespace))
		]);

		cpuUsedReq = cpuReqU;
		cpuUsedLim = cpuLimU;
		memUsedReq = memReqU;
		memUsedLim = memLimU;
		gpuMemUsed = gpuMemUsedFromPods ?? 0;
		cpuHardReq = cpuHardLim = memHardReq = memHardLim = gpuMemHard = null;
	}

	async function fetchQuota() {
		const [
			cpuReqU,
			cpuReqH,
			cpuLimU,
			cpuLimH,
			memReqU,
			memReqH,
			memLimU,
			memLimH,
			gpuMemUsedFromPods,
			gpuMemHardFromRq
		] = await Promise.all([
			queryScalar(rqSum('requests.cpu', 'used')),
			queryScalar(rqSum('requests.cpu', 'hard')),
			queryScalar(rqSum('limits.cpu', 'used')),
			queryScalar(rqSum('limits.cpu', 'hard')),
			queryScalar(rqSum('requests.memory', 'used')),
			queryScalar(rqSum('requests.memory', 'hard')),
			queryScalar(rqSum('limits.memory', 'used')),
			queryScalar(rqSum('limits.memory', 'hard')),
			queryScalar(podContainerReadyGpuMemTotalSum(namespace)),
			queryScalar(rqSum('limits.nvidia.com/gpumem', 'hard'))
		]);

		cpuUsedReq = cpuReqU;
		cpuHardReq = cpuReqH;
		cpuUsedLim = cpuLimU;
		cpuHardLim = cpuLimH;
		memUsedReq = memReqU;
		memHardReq = memReqH;
		memUsedLim = memLimU;
		memHardLim = memLimH;
		gpuMemUsed = gpuMemUsedFromPods ?? 0;
		gpuMemHard = gpuMemHardFromRq ?? 0;
	}

	function resetQuotaState() {
		cpuUsedReq = cpuHardReq = cpuUsedLim = cpuHardLim = null;
		memUsedReq = memHardReq = memUsedLim = memHardLim = null;
		gpuMemUsed = gpuMemHard = null;
	}

	async function countScalar(q: string): Promise<number> {
		const r = await prometheusDriver.instantQuery(q, new Date());
		return instantScalar(r) ?? 0;
	}

	/**
	 * Whether the namespace has a ResourceQuota, per Prometheus:
	 *  1. `kube_namespace_created` has a series → KSM is live and sees this namespace
	 *  2. `kube_resourcequota` has a series      → a ResourceQuota object exists
	 * Without (1) this throws, so the tile shows an error rather than a misleading `used / ∞`.
	 * Any query failure also throws, never read as "no quota".
	 *
	 * The resourcequota collector's state is not checked: Prometheus keeps no metadata for a KSM
	 * family without series (measured on KSM v2.20.0 + Prometheus v3.14: `kube_resourcequota`
	 * has 0 series and no metadata when the cluster has no quota), so it cannot be told from
	 * metadata. The cost is `∞` instead of an error if the collector is disabled; the chart
	 * decides that, and OtterScale's prometheus-stack enables it by default.
	 */
	async function hasResourceQuota(): Promise<boolean> {
		const [nsSeen, rqSeries] = await Promise.all([countScalar(nsCount()), countScalar(rqCount())]);
		return resourceQuotaPresence(nsSeen, rqSeries);
	}

	async function fetch() {
		try {
			hasError = false;
			if (!namespace) return;
			quotaUnlimited = !(await hasResourceQuota());
			await (quotaUnlimited ? fetchUnlimitedUsage() : fetchQuota());
		} catch (error) {
			hasError = true;
			resetQuotaState();
			console.error('Failed to fetch workspace resource quota:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	function formatCpuCores(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(2);
	}

	/** `nvidia.com/gpumem` values are reported in MiB; convert to bytes so `formatCapacity` can
	 *  pick the best-fit unit (KB/MB/GB/TB), same as the CPU/RAM cards. */
	function formatGpuMem(nMb: number): { value: number; unit: string } {
		return formatCapacity(nMb * 1024 * 1024);
	}
	function formatBytes(n: number): string {
		const { value, unit } = formatCapacity(n);
		return `${value} ${unit}`;
	}

	function formatGpuMemText(nMb: number): string {
		const { value, unit } = formatGpuMem(nMb);
		return `${value} ${unit}`;
	}
</script>

<!--
	From shadcn.io stats-quota-tile-grid and stats-progress-threshold-colored: one tile per quota,
	the amount in use, a bar whose color steps as it fills, then the share and what is left.
	A resource without a limit has no bar at all: there is no ceiling to draw it against.
-->
{#snippet quota(
	label: string,
	used: number | null,
	hard: number | null,
	format: (n: number) => string
)}
	{@const failed = hasError || used === null}
	<div class="flex min-w-0 flex-col bg-card px-(--card-spacing) py-4">
		<h3 class="text-sm font-medium">{label}</h3>
		{#if failed || (!quotaUnlimited && hard === null)}
			<p class="mt-2 text-2xl font-semibold text-muted-foreground" aria-hidden="true">—</p>
			<p class="mt-3 text-sm text-muted-foreground">{m.no_data_display()}</p>
		{:else}
			<p
				class="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-xl font-semibold tracking-tight tabular-nums"
			>
				<bdi class="whitespace-nowrap">{format(used!)}</bdi>
				<span class="text-sm font-normal tracking-normal whitespace-nowrap text-muted-foreground">
					/ {quotaUnlimited ? UNLIMITED : format(hard!)}
				</span>
			</p>
			{#if quotaUnlimited}
				<p class="mt-3 flex items-center gap-1.5 text-sm font-medium">
					<InfinityIcon class="size-4 text-muted-foreground" />
					{m.quota_no_limit()}
				</p>
				<p class="mt-2 text-xs text-muted-foreground">{m.quota_no_limit_hint()}</p>
			{:else if hard === 0}
				<Meter class="mt-4 **:data-[slot=progress-track]:h-2" value={0} {label} tone="muted" />
				<p class="mt-2 text-sm text-muted-foreground">{m.quota_percent_used({ percent: '0' })}</p>
			{:else}
				{@const ratio = used! / hard!}
				<Meter
					class="mt-4 **:data-[slot=progress-track]:h-2"
					value={Math.min(100, ratio * 100)}
					{label}
					tone={usageTone(ratio)}
				/>
				<p class="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm tabular-nums">
					<span class={cn('font-medium', ratio >= 0.9 && 'text-destructive')}>
						{m.quota_percent_used({ percent: formatPercentage(used!, hard!, 1) ?? '0' })}
					</span>
					<span class={ratio > 1 ? 'font-medium text-destructive' : 'text-muted-foreground'}>
						{ratio > 1
							? m.quota_over({ amount: format(used! - hard!) })
							: m.quota_left({ amount: format(hard! - used!) })}
					</span>
				</p>
			{/if}
		{/if}
	</div>
{/snippet}

<WidgetCard
	title={m.workspace_quota_usage_title()}
	description={m.workspace_quota_usage_description()}
	state={!namespace ? 'message' : !isLoaded ? 'loading' : hasError ? 'error' : 'ready'}
	onretry={fetch}
	message={m.workspace_namespace_unresolved()}
	flush
>
	{#snippet action()}
		<Segmented
			aria-label={m.workspace_quota_toggle_aria()}
			bind:value={quotaView}
			options={[
				{ value: 'requests', label: m.workspace_quota_toggle_requests() },
				{ value: 'limits', label: m.workspace_quota_toggle_limits() }
			]}
		/>
	{/snippet}
	<Band inset class="h-full sm:grid-cols-3">
		{@render quota(m.cpu(), cpuUsed, cpuHard, formatCpuCores)}
		{@render quota(m.ram(), memUsed, memHard, formatBytes)}
		{@render quota(m.gpu_memory(), gpuMemUsed, gpuMemHard, formatGpuMemText)}
	</Band>
</WidgetCard>
