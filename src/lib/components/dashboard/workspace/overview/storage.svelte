<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { levelOfCount } from '$lib/components/dashboard/shared/status';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Alert, AlertDescription } from '$lib/components/shadcnio/alert';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, type SharedMetrics } from '$lib/prometheus';

	import ValueList from './value-list.svelte';

	let {
		prometheusDriver,
		namespace,
		shared,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		shared: SharedMetrics;
		isReloading: boolean;
	} = $props();

	type StorageSnapshot = {
		requestedBytes: number;
		usedBytes: number;
		/** 0 when the cluster's capacity could not be read (best effort). */
		clusterTotalBytes: number;
		total: number;
		bound: number;
		pending: number;
	};

	function scalar(v: SampleValue | undefined): number | undefined {
		if (v?.value === undefined || v?.value === null) return undefined;
		const n = Number(v.value);
		return Number.isFinite(n) ? n : undefined;
	}

	async function fetchStorage(): Promise<StorageSnapshot | null> {
		const ns = escapePromqlStringLiteral(namespace);
		const evalAt = new Date();
		const [reqRes, usedRes, clusterTotalRes, totalRes, boundRes, pendingRes] = await Promise.all([
			prometheusDriver.instantQuery(
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`sum(kubelet_volume_stats_used_bytes{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			// The cluster's capacity, to say when requests exceed it. Best effort:
			// without it the card still shows the Workspace's own numbers.
			shared.instant('ceph-total-bytes', undefined, evalAt).catch((error) => {
				console.warn('Failed to fetch cluster storage capacity:', error);
				return undefined;
			}),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_info{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Bound"} == 1) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Pending"} == 1) or vector(0)`,
				evalAt
			)
		]);

		// The Workspace's own queries all answered with no series: nothing is
		// reporting on its volumes. (A live source answers `or vector(0)` with 0.)
		if ([reqRes, usedRes, totalRes, boundRes, pendingRes].every((r) => r.result.length === 0)) {
			return null;
		}

		return {
			requestedBytes: scalar(reqRes.result[0]?.value) ?? 0,
			usedBytes: scalar(usedRes.result[0]?.value) ?? 0,
			clusterTotalBytes: scalar(clusterTotalRes?.result[0]?.value) ?? 0,
			total: scalar(totalRes.result[0]?.value) ?? 0,
			bound: scalar(boundRes.result[0]?.value) ?? 0,
			pending: scalar(pendingRes.result[0]?.value) ?? 0
		};
	}

	const storage = useLoadable<StorageSnapshot>(
		async () => (namespace ? fetchStorage() : null),
		() => isReloading
	);

	const snap = $derived(storage.data);
	const provisioned = $derived(formatCapacity(snap?.requestedBytes ?? 0));
	const used = $derived(formatCapacity(snap?.usedBytes ?? 0));
	const clusterTotal = $derived(snap?.clusterTotalBytes ?? 0);
	const clusterCapacity = $derived(formatCapacity(clusterTotal));
	// Thin provisioning lets PVC requests exceed the physical pool; flag that case.
	const overProvisioned = $derived(clusterTotal > 0 && (snap?.requestedBytes ?? 0) > clusterTotal);
	const total = $derived(snap?.total ?? 0);
	const bound = $derived(snap?.bound ?? 0);
	const pending = $derived(snap?.pending ?? 0);
</script>

{#snippet reading(label: string, value: number, unit: string, hint?: string)}
	<div class="grid min-w-0 content-start gap-1">
		<p class="text-xs text-muted-foreground">{label}</p>
		<p class="text-2xl leading-8 font-medium tabular-nums">
			{value}
			<span class="text-sm font-normal text-muted-foreground">{unit}</span>
		</p>
		{#if hint}
			<!-- Two lines reserved: the hint wraps in a narrow card, and the skeleton matches. -->
			<p class="min-h-8 text-xs text-muted-foreground">{hint}</p>
		{/if}
	</div>
{/snippet}

<WidgetCard
	title={m.workspace_storage_title()}
	info={m.workspace_storage_description()}
	status={storage.status}
	stale={storage.stale}
	emptyDescription={namespace ? m.wso_storage_empty() : m.workspace_namespace_unresolved()}
	bodyClass="min-h-40 gap-4"
>
	{#snippet skeleton()}
		<div class="grid grid-cols-2 gap-4">
			{#each [0, 1] as index (index)}
				<div class="grid content-start gap-1">
					<Skeleton class="h-4 w-20" />
					<Skeleton class="h-8 w-24" />
					{#if index === 1}<div class="h-8"><Skeleton class="h-3.5 w-24" /></div>{/if}
				</div>
			{/each}
		</div>
		<div class="grid gap-1.5">
			<div class="flex h-5 items-center justify-between gap-4">
				<Skeleton class="h-3.5 w-24" />
				<Skeleton class="h-3.5 w-20" />
			</div>
			<Skeleton class="h-1.5 w-full rounded-full" />
		</div>
		<ValueList skeleton={3} />
	{/snippet}

	<div class="grid grid-cols-2 gap-4">
		{@render reading(m.workspace_pvc_provisioned(), provisioned.value, provisioned.unit)}
		{@render reading(m.workspace_pvc_used(), used.value, used.unit, m.workspace_pvc_used_hint())}
	</div>

	{#if overProvisioned}
		<Alert variant="warning" role="status">
			<TriangleAlertIcon aria-hidden="true" />
			<AlertDescription class="text-xs text-foreground">
				{m.workspace_pvc_exceeds_cluster({
					capacity: `${clusterCapacity.value} ${clusterCapacity.unit}`
				})}
			</AlertDescription>
		</Alert>
	{/if}

	<!-- All bound is the good case, so the bar is never coloured by how full it is. -->
	<Meter
		label={m.workspace_pvc_volume_status()}
		percent={total > 0 ? Math.min(100, (100 * bound) / total) : null}
		level="neutral"
	/>

	<ValueList
		rows={[
			{ label: m.workspace_pvc_total_count(), value: total },
			{ label: m.workspace_pvc_bound_count(), value: bound },
			{
				label: m.workspace_pvc_pending(),
				value: pending,
				level: levelOfCount(pending, 'warn')
			}
		]}
	/>
</WidgetCard>
