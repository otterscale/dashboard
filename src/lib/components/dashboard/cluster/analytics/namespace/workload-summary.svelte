<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { PrometheusDriver } from 'prometheus-query';

	import {
		type LoadStatus,
		orThrow,
		useLoadable
	} from '$lib/components/dashboard/shared/loadable.svelte';
	import { levelOfCount, levelText } from '$lib/components/dashboard/shared/status';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstantOrNull } from '$lib/prometheus';

	import KpiCard from '../kpi-card.svelte';

	// Resource-consumption headline. Defaults to the whole cluster; when a namespace is
	// selected the values scope to it.
	let {
		client,
		namespace,
		isReloading = $bindable()
	}: { client: PrometheusDriver; namespace: string | undefined; isReloading?: boolean } = $props();

	// '' for the cluster-wide default, otherwise a `namespace="…"` selector fragment.
	const nsSel = $derived.by(() => {
		const ns = (namespace ?? '').trim();
		return ns && ns !== '.*' ? `namespace="${escapePromqlStringLiteral(ns)}"` : '';
	});

	type Summary = {
		running: number | null;
		cpu: number | null;
		memory: number | null;
		restarts: number | null;
	};

	// All four scalars come back in a single `or`-unioned instant query.
	const summary = useLoadable<Summary>(
		async () => {
			const sel = nsSel;
			const and = sel ? `,${sel}` : '';
			const r = orThrow(
				await fetchCombinedInstantOrNull(client, {
					running: `sum(kube_pod_status_phase{phase="Running"${and}})`,
					cpu: `sum(rate(container_cpu_usage_seconds_total{container!=""${and}}[2m]))`,
					memory: `sum(container_memory_working_set_bytes{container!=""${and}})`,
					restarts: `sum(increase(kube_pod_container_status_restarts_total{${sel}}[1h]))`
				})
			);
			const read = (key: string): number | null => {
				const value = r[key][0]?.value?.value;
				return value === undefined || value === null ? null : Number(value);
			};
			const next: Summary = {
				running: read('running'),
				cpu: read('cpu'),
				memory: read('memory'),
				restarts: read('restarts')
			};
			return Object.values(next).every((value) => value === null) ? null : next;
		},
		() => isReloading ?? false
	);

	// One query feeds four tiles; a tile whose own series is missing is empty on its own.
	function statusOf(value: number | null | undefined): LoadStatus {
		if (summary.status !== 'ready') return summary.status;
		return value === null || value === undefined ? 'empty' : 'ready';
	}

	const restarts = $derived(Math.round(summary.data?.restarts ?? 0));
	const mem = $derived(formatCapacity(summary.data?.memory ?? 0));
</script>

<div class="grid w-full gap-5 sm:grid-cols-2 xl:grid-cols-4">
	<KpiCard
		title={m.pods()}
		description={m.workload_kpi_pods_description()}
		tooltip={m.workload_kpi_pods_tooltip()}
		icon={BoxIcon}
		status={statusOf(summary.data?.running)}
		stale={summary.stale}
	>
		{Math.round(summary.data?.running ?? 0)}
	</KpiCard>
	<KpiCard
		title={m.workload_kpi_restarts()}
		description={m.workload_kpi_restarts_description()}
		tooltip={m.workload_kpi_restarts_tooltip()}
		icon={RotateCcwIcon}
		status={statusOf(summary.data?.restarts)}
		stale={summary.stale}
	>
		<!-- No restarts is the normal case and takes no colour. -->
		<span class={levelText[levelOfCount(restarts)]}>{restarts}</span>
	</KpiCard>
	<KpiCard
		title={m.cpu()}
		description={m.workload_kpi_cpu_description()}
		tooltip={m.workload_kpi_cpu_tooltip()}
		icon={CpuIcon}
		status={statusOf(summary.data?.cpu)}
		stale={summary.stale}
	>
		{(summary.data?.cpu ?? 0).toFixed(1)}
	</KpiCard>
	<KpiCard
		title={m.memory()}
		description={m.workload_kpi_memory_description()}
		tooltip={m.workload_kpi_memory_tooltip()}
		icon={MemoryStickIcon}
		status={statusOf(summary.data?.memory)}
		stale={summary.stale}
	>
		{mem.value}
		{mem.unit}
	</KpiCard>
</div>
