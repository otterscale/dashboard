<script lang="ts">
	import { untrack } from 'svelte';

	import { GIB, MIB } from '$lib/components/dashboard/kit/format';
	import HistoryChart, {
		type ChartPoint,
		type ChartSeries
	} from '$lib/components/dashboard/kit/history-chart.svelte';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';
	import type { SharedMetrics } from '$lib/prometheus';

	import { colorsFor, LIMIT } from './lib/chart-style';
	import type { ModelPods } from './lib/model-pods';
	import { byDeviceUuid, fmtPodGiB, shortPod } from './lib/pods';

	// GPU memory per pod over the window, against its HAMi allocation. The shared scope answers per
	// card and only at an instant, so the line is sampled at even points across the window. A card's
	// usage is the pod's own only when the pod is its sole HAMi tenant; other pods are left out.
	let {
		shared,
		model,
		start,
		end,
		points = 20,
		height = 180
	}: {
		shared: SharedMetrics;
		model: ModelPods | undefined;
		start: Date;
		end: Date;
		points?: number;
		height?: number;
	} = $props();

	type Data = { data: ChartPoint[]; series: ChartSeries[]; quota?: number };

	const loader = new Loader<Data>(
		async () => {
			if (!model) return null;
			const tenants = byDeviceUuid(await shared.instant('gpu-shared-count'));
			const pods = model.pods.filter(
				(p) => p.hami.length > 0 && p.hami.every((d) => (tenants.get(d.uuid) ?? 1) <= 1)
			);
			if (pods.length === 0) return { data: [], series: [] };

			const t0 = start.getTime();
			const span = end.getTime() - t0;
			const times = Array.from({ length: points }, (_, i) =>
				Math.round(t0 + (span * i) / Math.max(1, points - 1))
			);
			// A few requests at a time: the browser has six connections for the whole page.
			const samples: (Map<string, number> | undefined)[] = [];
			for (let i = 0; i < times.length; i += 4) {
				const batch = await Promise.all(
					times.slice(i, i + 4).map((t) =>
						shared
							.instant('vgpu-memory-used', undefined, new Date(t))
							.then(byDeviceUuid)
							.catch(() => undefined)
					)
				);
				samples.push(...batch);
			}
			if (samples.every((s) => s === undefined)) return null;

			const colors = colorsFor(pods.map((p) => p.name));
			const series: ChartSeries[] = pods.map((p, i) => ({
				key: `s${i}`,
				label: shortPod(p.name),
				color: colors.get(p.name),
				width: 1.5,
				style: 'line'
			}));
			const quotas = pods.map((p) => p.hami.reduce((sum, d) => sum + d.mib * MIB, 0));
			const quota = Math.max(...quotas) / GIB;
			const data: ChartPoint[] = [];
			times.forEach((t, j) => {
				const sample = samples[j];
				if (!sample) return;
				const row = { date: new Date(t) } as ChartPoint;
				let any = false;
				pods.forEach((p, i) => {
					let used = 0;
					for (const d of p.hami) {
						const v = sample.get(d.uuid);
						if (v === undefined) return;
						used += v;
					}
					row[`s${i}`] = used / GIB;
					any = true;
				});
				if (any) data.push({ ...row, quota });
			});
			series.push({
				key: 'quota',
				label: m.model_analytics_gpu_quota(),
				color: LIMIT.color,
				width: LIMIT.width,
				style: LIMIT.style
			});
			return { data, series, quota };
		},
		(d) => d.data.length === 0
	);

	// A new window starts the chart over; a new pod list (the same window) only refreshes it.
	let shownWindow: string | undefined;
	$effect(() => {
		const window = `${start.getTime()}-${end.getTime()}`;
		if (!model) return;
		untrack(() => {
			if (window !== shownWindow) {
				shownWindow = window;
				loader.reset();
			}
			void loader.load();
		});
	});
</script>

<HistoryChart
	title={m.model_analytics_gpu_memory_per_pod()}
	peak={loader.data?.quota !== undefined
		? m.model_analytics_used_vs_hami({ quota: fmtPodGiB(loader.data.quota * GIB) })
		: undefined}
	data={loader.data?.data ?? []}
	series={loader.data?.series ?? []}
	format={(v) => `${fmtPodGiB(v * GIB)} GiB`}
	state={loader.state}
	{height}
/>
