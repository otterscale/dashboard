<script lang="ts">
	import { type PrometheusDriver, ResponseType } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Meter, Panel, widgetState } from '$lib/components/dashboard/kit';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		classifyThreshold,
		escapePromqlStringLiteral,
		LIVE_PODS,
		thresholdClasses
	} from '$lib/prometheus';

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

	/**
	 * No ResourceQuota exists for the namespace (the workspace was created without
	 * `spec.resourceQuota.hard`), so `kube_resourcequota` reports nothing at all — neither `hard`
	 * nor `used`. Detected from Prometheus on every fetch; the tile then shows the pod-level
	 * requests/limits as plain numbers, with no bar: there is nothing to take a share of.
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

	type Amount = { value: string; unit: string };
	type QuotaRow = {
		label: string;
		/** `null`: the usage query failed or returned nothing. */
		used: Amount | null;
		/** `null`: no hard quota for this resource. */
		hard: Amount | null;
		/** Share of the hard quota, when there is one above zero. */
		percent: number | null;
	};

	function percentOf(used: number | null, hard: number | null): number | null {
		if (used === null || hard === null || hard <= 0) return null;
		return (100 * used) / hard;
	}

	function capacity(bytes: number | null): Amount | null {
		if (bytes === null) return null;
		const { value, unit } = formatCapacity(bytes);
		return { value: String(value), unit };
	}

	function gpuCapacity(mb: number | null): Amount | null {
		if (mb === null) return null;
		const { value, unit } = formatGpuMem(mb);
		return { value: String(value), unit };
	}

	const rows = $derived.by((): QuotaRow[] => {
		const failed = hasError;
		const limited = !quotaUnlimited;
		return [
			{
				label: m.cpu(),
				used:
					failed || cpuUsed === null ? null : { value: formatCpuCores(cpuUsed), unit: m.cores() },
				hard:
					limited && cpuHard !== null ? { value: formatCpuCores(cpuHard), unit: m.cores() } : null,
				percent: limited ? percentOf(cpuUsed, cpuHard) : null
			},
			{
				label: m.ram(),
				used: failed ? null : capacity(memUsed),
				hard: limited ? capacity(memHard) : null,
				percent: limited ? percentOf(memUsed, memHard) : null
			},
			{
				label: 'GPU Memory',
				used: failed ? null : gpuCapacity(gpuMemUsed),
				hard: limited ? gpuCapacity(gpuMemHard) : null,
				percent: limited ? percentOf(gpuMemUsed, gpuMemHard) : null
			}
		];
	});

	// Same bands the cluster cards use for a share of a ceiling.
	function percentClass(percent: number): string {
		return thresholdClasses(classifyThreshold(percent, { green: 70, orange: 90 })).text;
	}
</script>

<Panel
	title={m.workspace_quota_usage_title()}
	description={m.workspace_quota_usage_description()}
	state={namespace
		? widgetState(
				isLoaded,
				rows.some((row) => row.used !== null)
			)
		: 'ready'}
	class="min-h-[16rem] @md:min-h-[16.25rem]"
>
	{#snippet actions()}
		<div
			class="flex rounded-full bg-muted p-0.5"
			role="group"
			aria-label={m.workspace_quota_toggle_aria()}
		>
			<Button
				type="button"
				size="sm"
				variant={quotaView === 'requests' ? 'outline' : 'ghost'}
				class="h-6 rounded-full px-2 text-xs {quotaView === 'requests'
					? ''
					: 'text-muted-foreground'}"
				aria-pressed={quotaView === 'requests'}
				onclick={() => (quotaView = 'requests')}
			>
				{m.workspace_quota_toggle_requests()}
			</Button>
			<Button
				type="button"
				size="sm"
				variant={quotaView === 'limits' ? 'outline' : 'ghost'}
				class="h-6 rounded-full px-2 text-xs {quotaView === 'limits'
					? ''
					: 'text-muted-foreground'}"
				aria-pressed={quotaView === 'limits'}
				onclick={() => (quotaView = 'limits')}
			>
				{m.workspace_quota_toggle_limits()}
			</Button>
		</div>
	{/snippet}
	{#if !namespace}
		<p class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</p>
	{:else}
		<!-- One row per resource: its name and what it is measured against on the left, the amount
		     on the right, and a bar only when a hard quota gives it a scale. -->
		<ul class="flex flex-1 flex-col slashed-zero tabular-nums">
			{#each rows as row (row.label)}
				<li
					class="flex flex-1 flex-col justify-center border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium" title={row.label}>{row.label}</p>
							<p class="truncate text-xs leading-4 text-muted-foreground">
								{#if row.used === null}
									{m.no_data_display()}
								{:else if row.hard === null}
									{m.dashboard_no_quota()}
								{:else}
									{m.dashboard_of_total({ total: `${row.hard.value} ${row.hard.unit}` })}
								{/if}
							</p>
						</div>
						<p class="shrink-0 text-2xl leading-8 tracking-tight">
							{#if row.used === null}
								<span class="text-muted-foreground" aria-hidden="true">—</span>
							{:else}
								{row.used.value}<span class="ml-1 text-xs tracking-normal text-muted-foreground"
									>{row.used.unit}</span
								>
								{#if row.hard !== null && row.percent !== null}
									<span class="ml-1.5 text-sm tracking-normal {percentClass(row.percent)}">
										{Math.round(row.percent)} %
									</span>
								{/if}
							{/if}
						</p>
					</div>
					{#if row.used !== null && row.hard !== null && row.percent !== null}
						<div class="mt-2 flex">
							<Meter
								value={row.percent}
								class={row.percent >= 70 ? percentClass(row.percent) : ''}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Panel>
