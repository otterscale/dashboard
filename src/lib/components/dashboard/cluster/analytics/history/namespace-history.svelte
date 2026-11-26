<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import {
		fetchInstant,
		fetchRange,
		rangeLiteral,
		stats,
		stepFor,
		toPoints
	} from '$lib/components/dashboard/kit/fetch';
	import {
		DASH,
		fmt,
		fmtCores,
		fmtGiB,
		fmtPct,
		GIB,
		sum
	} from '$lib/components/dashboard/kit/format';
	import HistoryChart, {
		type ChartPoint
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import SummaryStrip from '$lib/components/dashboard/kit/summary-strip.svelte';
	import { m } from '$lib/messages';

	import { namespaceHistoryQueries, q } from '../lib/promql';
	import RestartsCard from './restarts-card.svelte';

	let {
		client,
		namespace,
		start,
		end,
		windowLabel
	}: {
		client: PrometheusDriver;
		/** Left out while the page has no namespace yet: the cards then wait in their loading state. */
		namespace: string | undefined;
		start: Date;
		end: Date;
		windowLabel: string;
	} = $props();

	type Data = {
		cpu: ChartPoint[];
		memory: ChartPoint[];
		gpu: ChartPoint[];
		summary: Record<string, { avg?: number; peak?: number }>;
		restarts?: number;
		// The three below are undefined when the request for them failed.
		storageUsed?: number;
		mounted?: number;
		volumes?: number;
	};

	const loader = new Loader<Data>(async () => {
		if (!namespace) return null;
		const ns = q(namespace);
		const [r, now] = await Promise.all([
			fetchRange(client, namespaceHistoryQueries(namespace), start, end, stepFor(start, end, 90)),
			fetchInstant(
				client,
				{
					restarts: `sum(increase(kube_pod_container_status_restarts_total{namespace=${ns}}[${rangeLiteral(start, end)}]))`,
					storage: `max by (persistentvolumeclaim) (kubelet_volume_stats_used_bytes{namespace=${ns}})`,
					claims: `count(kube_persistentvolumeclaim_info{namespace=${ns}})`
				},
				end
			)
		]);
		if (!r) return null;
		return {
			cpu: toPoints(r, ['cpuUse', 'cpuReq', 'cpuLim']),
			memory: toPoints(r, ['memUse', 'memReq', 'memLim']).map((p) => ({
				...p,
				memUse: Number(p.memUse ?? 0) / GIB,
				memReq: Number(p.memReq ?? 0) / GIB,
				memLim: Number(p.memLim ?? 0) / GIB
			})),
			gpu: toPoints(r, ['gpuUtil']),
			summary: {
				cpuUse: stats(r.cpuUse[0]),
				cpuReq: stats(r.cpuReq[0]),
				memUse: stats(r.memUse[0]),
				memReq: stats(r.memReq[0]),
				gpuUtil: stats(r.gpuUtil[0])
			},
			restarts: now ? Math.round(now.restarts[0]?.value ?? 0) : undefined,
			storageUsed: now ? sum(now.storage.map((s) => s.value)) : undefined,
			mounted: now?.storage.length,
			volumes: now ? Math.round(now.claims[0]?.value ?? 0) : undefined
		};
	});

	// A new window starts from the loading cards; the page remounts this for a new namespace.
	$effect(() => {
		void [start.getTime(), end.getTime()];
		if (!namespace) return;
		untrack(() => {
			loader.reset();
			loader.load();
		});
	});

	const s = $derived(loader.data?.summary ?? {});
	const hasGpu = $derived((loader.data?.gpu.length ?? 0) > 0);
	const items = $derived([
		{
			label: m.analytics_cpu_usage(),
			value: fmtCores(s.cpuUse?.avg),
			note: m.analytics_cores_avg_peak({ peak: fmtCores(s.cpuUse?.peak) })
		},
		{
			label: m.analytics_memory_usage(),
			value: fmtGiB(s.memUse?.avg),
			note: m.analytics_gib_avg_peak({ peak: fmtGiB(s.memUse?.peak) })
		},
		{
			label: m.analytics_gpu_utilization(),
			value: hasGpu ? fmtPct(s.gpuUtil?.avg) : DASH,
			note: hasGpu
				? m.analytics_avg_peak({ peak: fmtPct(s.gpuUtil?.peak) })
				: m.analytics_no_gpu_workloads()
		},
		{
			label: m.analytics_pod_restarts(),
			value: fmt(loader.data?.restarts),
			note: m.analytics_in_the_last({ window: windowLabel })
		},
		{
			label: m.analytics_storage_used(),
			value: (loader.data?.mounted ?? 0) > 0 ? fmtGiB(loader.data?.storageUsed) : DASH,
			note:
				loader.data?.mounted === undefined
					? m.dashboard_couldnt_load()
					: loader.data.mounted > 0
						? m.analytics_gib_across_pvcs({ count: String(loader.data.mounted) })
						: (loader.data.volumes ?? 0) > 0
							? m.analytics_pvcs_none_mounted({ count: String(loader.data.volumes) })
							: m.analytics_no_volumes()
		}
	]);
	const cores = (v: number) => `${fmtCores(v)} ${m.analytics_unit_cores()}`;
	const gib = (v: number) => `${fmt(v, v < 10 ? 1 : 0)} ${m.analytics_unit_gib()}`;
</script>

<SummaryStrip {items} state={loader.state} />

<div class="grid gap-2 @md:gap-3 @4xl:grid-cols-2">
	<HistoryChart
		title={m.analytics_cpu_commitment()}
		peak={m.analytics_peak_usage_request({
			usage: cores(s.cpuUse?.peak ?? 0),
			request: cores(s.cpuReq?.peak ?? 0)
		})}
		data={loader.data?.cpu ?? []}
		state={loader.state}
		format={cores}
		series={[
			{ key: 'cpuUse', label: m.analytics_usage(), style: 'area' },
			{ key: 'cpuReq', label: m.analytics_request(), style: 'line', color: 'var(--chart-4)' },
			{ key: 'cpuLim', label: m.analytics_limit(), style: 'dashed', color: 'var(--chart-4)' }
		]}
	/>
	<HistoryChart
		title={m.analytics_memory_commitment()}
		peak={m.analytics_peak_usage_request({
			usage: gib((s.memUse?.peak ?? 0) / GIB),
			request: gib((s.memReq?.peak ?? 0) / GIB)
		})}
		data={loader.data?.memory ?? []}
		state={loader.state}
		format={gib}
		series={[
			{ key: 'memUse', label: m.analytics_usage(), style: 'area' },
			{ key: 'memReq', label: m.analytics_request(), style: 'line', color: 'var(--chart-4)' },
			{ key: 'memLim', label: m.analytics_limit(), style: 'dashed', color: 'var(--chart-4)' }
		]}
	/>
</div>

{#if hasGpu}
	<HistoryChart
		title={m.analytics_gpu_utilization()}
		peak={m.analytics_peak({ value: fmtPct(s.gpuUtil?.peak) })}
		data={loader.data?.gpu ?? []}
		state={loader.state}
		format={(v) => `${fmt(v)}%`}
		yMax={100}
		series={[{ key: 'gpuUtil', label: m.analytics_utilization(), style: 'area' }]}
	/>
{/if}

<RestartsCard
	{client}
	scope={namespace ? { namespace } : undefined}
	{start}
	{end}
	{windowLabel}
	describe={(pod) => pod.node || pod.namespace}
/>
