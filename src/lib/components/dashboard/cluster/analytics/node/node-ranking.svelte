<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { type Level, levelOf } from '$lib/components/dashboard/shared/status';
	import { m } from '$lib/messages';

	import type { RankingRow } from '../ranking';
	import RankingList from '../ranking-list.svelte';

	// Single-value node rankings complementing the CPU/Memory pressure cards. `pods` and
	// `restart` are kube-state-metrics joined to `kube_pod_info` for the `node` label;
	// `gpu` ranks by avg GPU utilisation, keyed by DCGM `hostname` (== node name). All three
	// label values feed the same node drill-in click.
	let {
		prometheusDriver,
		kind,
		title,
		description,
		tooltip,
		onNodeClick,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		kind: 'pods' | 'restart' | 'gpu';
		title: string;
		description: string;
		tooltip: string;
		onNodeClick?: (node: string) => void;
		isReloading?: boolean;
	} = $props();

	const query = $derived.by(() => {
		switch (kind) {
			case 'pods':
				return `100 * sum(kube_pod_status_phase{phase="Running"} * on(namespace,pod) group_left(node) kube_pod_info) by (node) / sum(kube_node_status_allocatable{resource="pods"}) by (node)`;
			case 'restart':
				// `> 0` keeps the chart to nodes that actually had restarts — empty is the healthy state.
				return `sum(increase(kube_pod_container_status_restarts_total[1h]) * on(namespace,pod) group_left(node) kube_pod_info) by (node) > 0`;
			case 'gpu':
				return `avg by(hostname) (DCGM_FI_DEV_GPU_UTIL)`;
		}
	});
	const labelKey = $derived(kind === 'gpu' ? 'hostname' : 'node');

	function displayValue(value: number): string {
		return kind === 'restart' ? `${Math.round(value)}` : `${Math.round(value)}%`;
	}
	// Pods/restarts carry a health meaning, so those bars are coloured by threshold. Pod density
	// reads as scheduling pressure (fine up to 70%, warning up to 90%, danger above). Restarts only
	// ever list nodes with at least one restart: 1-10/h is a warning, more than 10/h (sustained
	// crash-looping) is danger. GPU utilisation is the opposite — high is the desired state — so
	// it stays the plain bar colour and lets the descending rank surface idle nodes instead.
	function levelFor(value: number): Level | undefined {
		if (kind === 'gpu') return undefined;
		return kind === 'pods' ? levelOf(value) : levelOf(value, { warn: 0, danger: 10 });
	}

	const ranking = useLoadable<RankingRow[]>(
		async () => {
			const response = await prometheusDriver.instantQuery(query);
			const series = (response.result ?? []) as {
				metric: { labels: Record<string, string> };
				value?: { value: unknown };
			}[];
			const rows = series
				.map((s) => {
					const node = s.metric?.labels?.[labelKey] ?? '';
					const value = Number(s.value?.value);
					return node && Number.isFinite(value)
						? { label: node, value, displayValue: displayValue(value), level: levelFor(value) }
						: null;
				})
				.filter((row): row is NonNullable<typeof row> => row !== null)
				.sort((a, b) => b.value - a.value);
			return rows.length > 0 ? rows : null;
		},
		() => isReloading ?? false
	);

	// An empty restart list is the healthy answer, and no GPU series means no GPU: say which.
	const emptyTitle = $derived(
		kind === 'restart' ? m.dash_no_restarts() : kind === 'gpu' ? m.dash_no_gpu() : undefined
	);
</script>

<RankingList
	{title}
	{description}
	info={tooltip}
	rows={ranking.data ?? []}
	status={ranking.status}
	stale={ranking.stale}
	onRowClick={onNodeClick}
	{emptyTitle}
	emptyDescription={emptyTitle ? '' : undefined}
/>
