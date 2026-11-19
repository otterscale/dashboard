<script lang="ts">
	import { type PrometheusDriver, ResponseType } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import WidgetState from '$lib/components/dashboard/shared/widget-state.svelte';
	import { Badge } from '$lib/components/shadcnio/badge';
	import {
		SegmentGroup,
		SegmentGroupItem,
		SegmentGroupItemText
	} from '$lib/components/shadcnio/segment-group';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, LIVE_PODS } from '$lib/prometheus';

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

	type QuotaView = 'requests' | 'limits';

	/** Which ResourceQuota resource keys to visualize (requests.* vs limits.*). */
	let quotaView = $state<QuotaView>('requests');

	/** One query that failed. The others still draw their rows. */
	const FAILED = Symbol('failed');

	/** A value, `null` when the query answered with no series, or `FAILED`. */
	type Reading = number | null | typeof FAILED;

	type QuotaSnapshot = {
		/**
		 * No ResourceQuota exists for the namespace (the workspace was created without
		 * `spec.resourceQuota.hard`), so `kube_resourcequota` reports nothing at all — neither `hard`
		 * nor `used`. Detected from Prometheus on every fetch; the rows then read `used / ∞` from
		 * pod-level requests/limits instead of a ratio.
		 */
		unlimited: boolean;
		cpuUsedReq: Reading;
		cpuHardReq: Reading;
		cpuUsedLim: Reading;
		cpuHardLim: Reading;
		memUsedReq: Reading;
		memHardReq: Reading;
		memUsedLim: Reading;
		memHardLim: Reading;
		gpuMemUsed: Reading;
		gpuMemHard: Reading;
	};

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

	/** `null` when the query answered with no series, `FAILED` when it did not answer. */
	async function queryScalar(q: string): Promise<Reading> {
		try {
			const r = await prometheusDriver.instantQuery(q, new Date());
			return instantScalar(r);
		} catch (error) {
			console.error('Workspace quota query failed:', q, error);
			return FAILED;
		}
	}

	/** Nothing answered at all: that is the card's failure, not five rows'. */
	function orAllFailed(snapshot: QuotaSnapshot, readings: Reading[]): QuotaSnapshot {
		if (readings.every((r) => r === FAILED)) throw new Error('every quota query failed');
		return snapshot;
	}

	/** No ResourceQuota to read: only the numerators exist, and they come from the pods. */
	async function fetchUnlimitedUsage(): Promise<QuotaSnapshot> {
		const [cpuReqU, cpuLimU, memReqU, memLimU, gpuMemUsedFromPods] = await Promise.all([
			queryScalar(podResourceSum('requests', 'cpu')),
			queryScalar(podResourceSum('limits', 'cpu')),
			queryScalar(podResourceSum('requests', 'memory')),
			queryScalar(podResourceSum('limits', 'memory')),
			queryScalar(podContainerReadyGpuMemTotalSum(namespace))
		]);

		return orAllFailed(
			{
				unlimited: true,
				cpuUsedReq: cpuReqU,
				cpuUsedLim: cpuLimU,
				memUsedReq: memReqU,
				memUsedLim: memLimU,
				gpuMemUsed: gpuMemUsedFromPods ?? 0,
				cpuHardReq: null,
				cpuHardLim: null,
				memHardReq: null,
				memHardLim: null,
				gpuMemHard: null
			},
			[cpuReqU, cpuLimU, memReqU, memLimU, gpuMemUsedFromPods]
		);
	}

	async function fetchQuota(): Promise<QuotaSnapshot> {
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

		return orAllFailed(
			{
				unlimited: false,
				cpuUsedReq: cpuReqU,
				cpuHardReq: cpuReqH,
				cpuUsedLim: cpuLimU,
				cpuHardLim: cpuLimH,
				memUsedReq: memReqU,
				memHardReq: memReqH,
				memUsedLim: memLimU,
				memHardLim: memLimH,
				gpuMemUsed: gpuMemUsedFromPods ?? 0,
				gpuMemHard: gpuMemHardFromRq ?? 0
			},
			[
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
			]
		);
	}

	async function countScalar(q: string): Promise<number> {
		const r = await prometheusDriver.instantQuery(q, new Date());
		return instantScalar(r) ?? 0;
	}

	/**
	 * Whether the namespace has a ResourceQuota, per Prometheus:
	 *  1. `kube_namespace_created` has a series → KSM is live and sees this namespace
	 *  2. `kube_resourcequota` has a series      → a ResourceQuota object exists
	 * Without (1) this throws, so the card shows an error rather than a misleading `used / ∞`.
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

	// A failed presence check, or every reading failing, throws: the card shows the
	// error state, or keeps the earlier readings with the stale mark. One failed
	// reading among others is that row's error state.
	const quota = useLoadable<QuotaSnapshot>(
		async () => {
			if (!namespace) return null;
			return (await hasResourceQuota()) ? fetchQuota() : fetchUnlimitedUsage();
		},
		() => isReloading
	);

	function formatCpuCores(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(2);
	}

	/** `nvidia.com/gpumem` values are reported in MiB; convert to bytes so `formatCapacity` can
	 *  pick the best-fit unit (KB/MB/GB/TB), same as the CPU/RAM rows. */
	function formatGpuMem(nMb: number): { value: number; unit: string } {
		return formatCapacity(nMb * 1024 * 1024);
	}

	function capacityText(c: { value: number; unit: string }): string {
		return `${c.value} ${c.unit}`;
	}

	/**
	 * What one resource's row draws:
	 * - `meter`: a reading against its hard quota, with the bar.
	 * - `unlimited`: no ResourceQuota; the reading against ∞, no bar.
	 * - `none`: the quota for this resource is 0 (GPU memory when no GPU is granted).
	 * - `missing`: the query answered, without a value for this resource.
	 * - `error`: a query this row needs failed.
	 */
	type QuotaRow = { label: string } & (
		| { kind: 'meter'; reading: string; percent: number }
		| { kind: 'unlimited'; reading: string }
		| { kind: 'none'; reading?: string }
		| { kind: 'missing' }
		| { kind: 'error' }
	);

	function ratioRow(
		label: string,
		unlimited: boolean,
		used: Reading,
		hard: Reading,
		format: (n: number) => string,
		/** Separator of the bounded reading: CPU reads `a / b`, capacities read `a/b`. */
		separator: string
	): QuotaRow {
		if (used === FAILED) return { label, kind: 'error' };
		if (unlimited) {
			if (used === null) return { label, kind: 'missing' };
			return { label, kind: 'unlimited', reading: `${format(used)} / ${UNLIMITED}` };
		}
		if (hard === FAILED) return { label, kind: 'error' };
		if (used === null || hard === null || hard === 0) return { label, kind: 'missing' };
		return {
			label,
			kind: 'meter',
			reading: `${format(used)}${separator}${format(hard)}`,
			percent: (used * 100) / hard
		};
	}

	const rows = $derived.by((): QuotaRow[] => {
		const q = quota.data;
		if (!q) return [];
		const requests = quotaView === 'requests';
		const gpuFormat = (n: number) => capacityText(formatGpuMem(n));

		// A GPU memory quota of 0 is an answer, not a missing value: say "none".
		const gpu: QuotaRow =
			!q.unlimited && typeof q.gpuMemUsed === 'number' && q.gpuMemHard === 0
				? {
						label: m.gpu_memory(),
						kind: 'none',
						reading: q.gpuMemUsed > 0 ? gpuFormat(q.gpuMemUsed) : undefined
					}
				: ratioRow(m.gpu_memory(), q.unlimited, q.gpuMemUsed, q.gpuMemHard, gpuFormat, '/');

		return [
			ratioRow(
				m.cpu(),
				q.unlimited,
				requests ? q.cpuUsedReq : q.cpuUsedLim,
				requests ? q.cpuHardReq : q.cpuHardLim,
				formatCpuCores,
				' / '
			),
			ratioRow(
				m.ram(),
				q.unlimited,
				requests ? q.memUsedReq : q.memUsedLim,
				requests ? q.memHardReq : q.memHardLim,
				(n) => capacityText(formatCapacity(n)),
				'/'
			),
			gpu
		];
	});
</script>

<WidgetCard
	title={m.workspace_quota_usage_title()}
	info={m.workspace_quota_usage_description()}
	status={quota.status}
	stale={quota.stale}
	emptyDescription={m.workspace_namespace_unresolved()}
	bodyClass="min-h-48 justify-center gap-6"
>
	{#snippet action()}
		<SegmentGroup
			aria-label={m.workspace_quota_toggle_aria()}
			value={quotaView}
			onValueChange={(details) => (quotaView = details.value as QuotaView)}
			class="gap-0 rounded-md bg-muted p-0.5 [&_[data-slot=segment-group-indicator]]:bg-background [&_[data-slot=segment-group-indicator]]:shadow-xs dark:[&_[data-slot=segment-group-indicator]]:bg-input"
		>
			{#each [{ value: 'requests', label: m.workspace_quota_toggle_requests() }, { value: 'limits', label: m.workspace_quota_toggle_limits() }] as option (option.value)}
				<SegmentGroupItem
					value={option.value}
					class="inline-flex h-7 items-center justify-center px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=checked]:text-foreground"
				>
					<SegmentGroupItemText>{option.label}</SegmentGroupItemText>
				</SegmentGroupItem>
			{/each}
		</SegmentGroup>
	{/snippet}

	{#snippet skeleton()}
		{#each [0, 1, 2] as index (index)}
			<div class="grid gap-1.5">
				<div class="flex h-5 items-center justify-between gap-4">
					<Skeleton class="h-3.5 w-24" />
					<Skeleton class="h-3.5 w-36" />
				</div>
				<Skeleton class="h-1.5 w-full rounded-full" />
			</div>
		{/each}
	{/snippet}

	{#each rows as row (row.label)}
		{#if row.kind === 'meter'}
			<Meter label={row.label} value={row.reading} percent={row.percent} />
		{:else if row.kind === 'unlimited'}
			<Meter label={row.label} value={row.reading} percent={null} unlimited />
		{:else}
			<!-- Same two lines as a meter, without a bar: there is no proportion to draw. -->
			<div class="grid min-w-0 gap-1.5">
				<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
					<span class="truncate text-sm font-medium">{row.label}</span>
					<span class="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2">
						{#if row.kind === 'none'}
							{#if row.reading}
								<span class="font-mono text-xs text-muted-foreground tabular-nums">
									{row.reading}
								</span>
							{/if}
							<Badge variant="outline" pill>{m.dash_none()}</Badge>
						{:else if row.kind === 'error'}
							<WidgetState kind="error" compact />
						{:else}
							<WidgetState kind="empty" compact description={m.wso_quota_value_missing()} />
						{/if}
					</span>
				</div>
				<p class="text-xs text-muted-foreground">
					{row.kind === 'none'
						? m.wso_gpu_quota_zero()
						: row.kind === 'error'
							? m.dash_state_error_description()
							: m.wso_quota_value_missing()}
				</p>
			</div>
		{/if}
	{/each}
</WidgetCard>
