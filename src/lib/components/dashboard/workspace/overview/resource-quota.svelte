<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		type ListRequest,
		type ListResponse,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import { type InstantVector, type PrometheusDriver, ResponseType } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, widgetState } from '$lib/components/dashboard/kit';
	import { Button } from '$lib/components/ui/button/index.js';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, LIVE_PODS, type SharedMetrics } from '$lib/prometheus';

	import { gpuMemory } from './gpu-memory';
	import { POD } from './links';
	import { resourceQuotaPresence } from './resource-quota';

	let {
		prometheusDriver,
		cluster,
		namespace,
		shared,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		shared: SharedMetrics;
		isReloading: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	/** Which side of the ResourceQuota to compare: `requests.*` or `limits.*`. */
	let quotaView = $state<'requests' | 'limits'>('requests');

	/**
	 * One reading per resource. `requests`/`limits` are what the pods ask for (the quota's `used`
	 * counter when a quota tracks it, else summed from the pods); `hard` is the quota, `null` when
	 * none is set; `usage` is what is actually in use.
	 */
	type Reading = {
		requests: number | null;
		limits: number | null;
		hardRequests: number | null;
		hardLimits: number | null;
		usage: number | null;
	};
	type Snapshot = {
		cpu: Reading;
		memory: Reading;
		gpu: Reading & { cards: number; sharedCards: number };
		storage: Reading;
	};

	let snap = $state<Snapshot | undefined>(undefined);
	let hasError = $state(false);

	function instantScalar(r: Awaited<ReturnType<PrometheusDriver['instantQuery']>>): number | null {
		const res = r.result;
		if (!Array.isArray(res) || res.length === 0) return null;
		const raw =
			r.resultType === ResponseType.SCALAR
				? (res as unknown[])[1]
				: (res[0] as { value?: { value?: unknown } })?.value?.value;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	}

	async function scalar(query: string): Promise<number | null> {
		try {
			return instantScalar(await prometheusDriver.instantQuery(query, new Date()));
		} catch {
			return null;
		}
	}

	const ns = $derived(escapePromqlStringLiteral(namespace));

	function quota(resource: string, type: 'used' | 'hard'): string {
		return `sum(kube_resourcequota{namespace="${ns}", type="${type}", resource="${resource}"})`;
	}

	/** What the live pods ask for, for a resource no quota counts. */
	function podSum(kind: 'requests' | 'limits', resource: 'cpu' | 'memory'): string {
		const unit = resource === 'cpu' ? 'core' : 'byte';
		return `sum(kube_pod_container_resource_${kind}{namespace="${ns}", resource="${resource}", unit="${unit}"} ${LIVE_PODS}) or vector(0)`;
	}

	/**
	 * Whether kube-state-metrics sees the namespace. Without it every quota reads as missing, so
	 * the card shows an error rather than "No quota set".
	 */
	async function checkKubeStateMetrics() {
		const count = async (q: string) =>
			instantScalar(await prometheusDriver.instantQuery(q, new Date())) ?? 0;
		const [nsSeen, rqSeries] = await Promise.all([
			count(`count(kube_namespace_created{namespace="${ns}"})`),
			count(`count(kube_resourcequota{namespace="${ns}", type="hard"})`)
		]);
		resourceQuotaPresence(nsSeen, rqSeries);
	}

	async function listPods(): Promise<unknown[]> {
		const out: unknown[] = [];
		let continueToken: string | undefined = undefined;
		for (;;) {
			const response: ListResponse = await resourceClient.list({
				cluster,
				namespace,
				group: POD.group,
				version: POD.version,
				resource: POD.resource,
				limit: BigInt(500),
				continue: continueToken
			} as ListRequest);
			out.push(...response.items.map((item) => item.object));
			continueToken = response.continue || undefined;
			if (!continueToken) break;
		}
		return out;
	}

	/** Per card, from a shared-scope answer keyed by `device_uuid`. */
	function byCard(result: { result: unknown[] } | undefined): Map<string, number> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
		const out = new Map<string, number>();
		for (const sample of (result?.result ?? []) as InstantVector[]) {
			const card = (sample.metric.labels as Record<string, string>).device_uuid;
			const value = Number(sample.value?.value);
			if (card && Number.isFinite(value)) out.set(card, value);
		}
		return out;
	}

	/**
	 * GPU memory: what the HAMi scheduler booked on each pod, and what is in use on the cards this
	 * namespace has to itself. Usage is best effort; without it the row still shows the booking.
	 */
	async function fetchGpu() {
		const [pods, used, tenants] = await Promise.all([
			listPods(),
			shared.instant('vgpu-memory-used').catch(() => undefined),
			shared.instant('gpu-shared-count').catch(() => undefined)
		]);
		return gpuMemory(pods as Parameters<typeof gpuMemory>[0], byCard(used), byCard(tenants));
	}

	async function fetchAll(): Promise<Snapshot> {
		await checkKubeStateMetrics();
		const gpuPromise = fetchGpu();
		const q = await Promise.all([
			// CPU: quota used / hard, pod sums, usage
			scalar(quota('requests.cpu', 'used')),
			scalar(quota('limits.cpu', 'used')),
			scalar(quota('requests.cpu', 'hard')),
			scalar(quota('limits.cpu', 'hard')),
			scalar(podSum('requests', 'cpu')),
			scalar(podSum('limits', 'cpu')),
			scalar(
				`sum(rate(container_cpu_usage_seconds_total{namespace="${ns}", container!=""}[5m])) or vector(0)`
			),
			// Memory
			scalar(quota('requests.memory', 'used')),
			scalar(quota('limits.memory', 'used')),
			scalar(quota('requests.memory', 'hard')),
			scalar(quota('limits.memory', 'hard')),
			scalar(podSum('requests', 'memory')),
			scalar(podSum('limits', 'memory')),
			scalar(
				`sum(container_memory_working_set_bytes{namespace="${ns}", container!=""}) or vector(0)`
			),
			// nvidia.com/gpumem counts MiB.
			scalar(quota('limits.nvidia.com/gpumem', 'hard')),
			// Storage
			scalar(quota('requests.storage', 'used')),
			scalar(quota('requests.storage', 'hard')),
			scalar(
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"}) or vector(0)`
			),
			// The same reading as the Storage card: each claim's last value in 5 minutes, since a
			// volume drops out while its pod restarts.
			scalar(
				`sum(max by (persistentvolumeclaim) (last_over_time(kubelet_volume_stats_used_bytes{namespace="${ns}"}[5m])) and on (persistentvolumeclaim) kube_persistentvolumeclaim_info{namespace="${ns}"}) or vector(0)`
			)
		]);
		const [cpuRqReq, cpuRqLim, cpuHardReq, cpuHardLim, cpuPodReq, cpuPodLim, cpuUse] = q;
		const [memRqReq, memRqLim, memHardReq, memHardLim, memPodReq, memPodLim, memUse] = q.slice(7);
		const [gpuHardMiB] = q.slice(14);
		const [stRqReq, stHard, stPvc, stUse] = q.slice(15);
		const gpu = await gpuPromise;

		const gpuHard = gpuHardMiB === null ? null : gpuHardMiB * 1024 * 1024;
		return {
			cpu: {
				requests: cpuRqReq ?? cpuPodReq,
				limits: cpuRqLim ?? cpuPodLim,
				hardRequests: cpuHardReq,
				hardLimits: cpuHardLim,
				usage: cpuUse
			},
			memory: {
				requests: memRqReq ?? memPodReq,
				limits: memRqLim ?? memPodLim,
				hardRequests: memHardReq,
				hardLimits: memHardLim,
				usage: memUse
			},
			gpu: {
				// HAMi allocates one amount per card; requests and limits are the same here.
				requests: gpu.allocated,
				limits: gpu.allocated,
				hardRequests: gpuHard,
				hardLimits: gpuHard,
				usage: gpu.used,
				cards: gpu.cards,
				sharedCards: gpu.sharedCards
			},
			storage: {
				// PVCs have no limits: both views show the requests.
				requests: stRqReq ?? stPvc,
				limits: stRqReq ?? stPvc,
				hardRequests: stHard,
				hardLimits: stHard,
				usage: stUse
			}
		};
	}

	async function fetch() {
		if (!namespace) return;
		try {
			snap = await fetchAll();
			hasError = false;
		} catch (error) {
			hasError = true;
			snap = undefined;
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

	/** Numbers on one row share a unit, picked from the largest of them. */
	type Scale = { unit: string; divisor: number };
	const GIB = 1024 ** 3;
	function byteScale(...values: (number | null)[]): Scale {
		const max = Math.max(0, ...values.map((v) => v ?? 0));
		if (max >= 1024 * GIB) return { unit: 'TiB', divisor: 1024 * GIB };
		if (max >= GIB) return { unit: 'GiB', divisor: GIB };
		return { unit: 'MiB', divisor: 1024 ** 2 };
	}

	function amount(value: number, scale: Scale): string {
		const v = value / scale.divisor;
		if (v === 0) return '0';
		if (v >= 10) return String(Math.round(v));
		return v.toFixed(1);
	}

	type Tone = 'ok' | 'warn' | 'bad' | '';
	// Share of the quota requested: below 80 % healthy, 80–89 % a warning, 90 % and up critical.
	function toneOf(percent: number): Tone {
		if (percent >= 90) return 'bad';
		if (percent >= 80) return 'warn';
		return 'ok';
	}
	const TONE_TEXT: Record<Tone, string> = {
		ok: 'text-chart-2',
		warn: 'text-chart-1',
		bad: 'text-destructive',
		'': ''
	};

	type Row = {
		label: string;
		/** `—` when there is nothing to show. */
		value: string;
		/** `of 16 cores`, or the unit alone when no quota is set. */
		of: string;
		tone: Tone;
		/** Bar widths in %: the lighter layer is what is requested, the darker what is in use. */
		soft: number;
		solid: number;
		bar: boolean;
		line: string;
	};

	function share(part: number | null, whole: number | null): number {
		if (part === null || whole === null || whole <= 0) return 0;
		return Math.min(100, Math.max(0, (100 * part) / whole));
	}

	function row(
		label: string,
		reading: Reading,
		scale: Scale,
		unitWord: string,
		extra?: string
	): Row {
		const asked = quotaView === 'requests' ? reading.requests : reading.limits;
		const hard = quotaView === 'requests' ? reading.hardRequests : reading.hardLimits;
		if (asked === null) {
			return { label, value: '—', of: '', tone: '', soft: 0, solid: 0, bar: false, line: '' };
		}
		const hasQuota = hard !== null && hard > 0;
		const unitOnly =
			quotaView === 'requests'
				? m.workspace_quota_requested_unit({ unit: unitWord })
				: m.workspace_quota_limits_unit({ unit: unitWord });
		const parts = [
			reading.usage === null
				? null
				: m.workspace_quota_in_use({ amount: `${amount(reading.usage, scale)} ${unitWord}` }),
			extra ?? null,
			hasQuota ? null : m.dashboard_no_quota()
		].filter(Boolean);
		return {
			label,
			value: amount(asked, scale),
			of: hasQuota
				? m.dashboard_of_total({ total: `${amount(hard, scale)} ${unitWord}` })
				: unitOnly,
			tone: hasQuota ? toneOf((100 * asked) / hard) : '',
			soft: hasQuota ? share(asked, hard) : asked > 0 ? 100 : 0,
			solid: hasQuota ? share(reading.usage, hard) : share(reading.usage, asked),
			bar: true,
			line: parts.join(' · ')
		};
	}

	const rows = $derived.by((): Row[] => {
		const s = snap;
		if (!s) return [];
		const cores: Scale = { unit: m.cores(), divisor: 1 };
		const memScale = byteScale(s.memory.requests, s.memory.limits, s.memory.hardLimits);
		const gpuScale = byteScale(s.gpu.requests, s.gpu.hardRequests);
		const stScale = byteScale(s.storage.requests, s.storage.hardRequests);
		const gpuRow: Row =
			(s.gpu.requests ?? 0) > 0
				? row(
						m.gpu_memory(),
						s.gpu,
						gpuScale,
						gpuScale.unit,
						[
							s.gpu.cards === 1
								? m.workspace_quota_gpu_on_one()
								: m.workspace_quota_gpu_on_many({ count: String(s.gpu.cards) }),
							// A shared card's usage belongs to several workloads and is left out.
							s.gpu.sharedCards > 0
								? m.workspace_quota_gpu_shared_excluded({ count: String(s.gpu.sharedCards) })
								: null
						]
							.filter(Boolean)
							.join(' · ')
					)
				: {
						label: m.gpu_memory(),
						value: '—',
						of: '',
						tone: '',
						soft: 0,
						solid: 0,
						bar: false,
						line: m.workspace_quota_no_gpu()
					};
		return [
			row(m.cpu(), s.cpu, cores, cores.unit),
			row(m.memory(), s.memory, memScale, memScale.unit),
			gpuRow,
			row(m.storage(), s.storage, stScale, stScale.unit)
		];
	});
</script>

<Panel
	title={m.workspace_quota_usage_title()}
	description={m.workspace_quota_usage_description()}
	state={namespace ? widgetState(isLoaded, rows.length > 0, hasError) : 'ready'}
	class="min-h-[22.9375rem] @md:min-h-[23.1875rem] @5xl:min-h-[25.3125rem]"
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
		<!-- Each row: the name and what is asked for against the quota, a two-layer bar (requested
		     lighter, in use darker, both as a share of the quota), then one line in small type. -->
		<ul class="flex flex-1 flex-col slashed-zero tabular-nums">
			{#each rows as r (r.label)}
				<li
					class="flex flex-1 flex-col justify-center gap-1.5 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
				>
					<div class="flex items-baseline justify-between gap-3">
						<p class="min-w-0 truncate text-sm font-medium">{r.label}</p>
						<p class="shrink-0 text-right">
							<span
								class="text-lg leading-6 tracking-tight {r.value === '—'
									? 'text-muted-foreground'
									: TONE_TEXT[r.tone]}">{r.value}</span
							>
							{#if r.of}<span class="ml-0.5 text-xs text-muted-foreground">{r.of}</span>{/if}
						</p>
					</div>
					<span
						class="relative block h-1.5 overflow-hidden rounded-full bg-muted"
						aria-hidden="true"
					>
						{#if r.bar}
							<span
								class="absolute inset-y-0 left-0 rounded-full bg-foreground/25"
								style:width="{r.soft}%"
							></span>
							<span
								class="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
								style:width="{r.solid}%"
							></span>
						{/if}
					</span>
					<p class="truncate text-xs leading-4 text-muted-foreground">{r.line || ' '}</p>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>
