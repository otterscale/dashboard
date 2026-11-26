<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, type SharedMetrics } from '$lib/prometheus';

	import { detailLink, PVC } from './links';
	import OverviewLink from './overview-link.svelte';
	import { fillingFirst, type VolumeReading, type VolumeRow } from './pvc-forecast';

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

	type Snapshot = {
		requested: number;
		used: number;
		count: number;
		rows: VolumeRow[];
		/** The cluster's raw capacity, when known: thin provisioning lets requests exceed it. */
		clusterTotal: number | null;
	};

	/** `null`: Prometheus has nothing for the namespace. */
	let snap = $state<Snapshot | null | undefined>(undefined);
	let hasError = $state(false);

	type Vector = { metric: { labels: Record<string, string> }; value: { value: number } }[];

	async function vector(query: string, evalAt: Date): Promise<Vector> {
		return (await prometheusDriver.instantQuery(query, evalAt)).result as Vector;
	}

	function first(result: Vector): number {
		const n = Number(result[0]?.value?.value);
		return Number.isFinite(n) ? n : 0;
	}

	function byClaim(result: Vector): Map<string, number> {
		return new Map(
			result.flatMap((sample) => {
				const claim = sample.metric?.labels?.persistentvolumeclaim;
				const value = Number(sample.value?.value);
				return claim && Number.isFinite(value) ? [[claim, value] as [string, number]] : [];
			})
		);
	}

	async function fetchStorage(): Promise<Snapshot | null> {
		const ns = escapePromqlStringLiteral(namespace);
		const evalAt = new Date();
		// Only mounted volumes report usage, and a volume whose pod restarts drops out between
		// scrapes, so each claim keeps its last reading from the past 5 minutes. Claims that no
		// longer exist are left out.
		const live = `and on (persistentvolumeclaim) kube_persistentvolumeclaim_info{namespace="${ns}"}`;
		const used = `max by (persistentvolumeclaim) (last_over_time(kubelet_volume_stats_used_bytes{namespace="${ns}"}[5m])) ${live}`;
		// The cluster's raw capacity, best effort: without it the card still shows the Workspace's
		// own numbers.
		const clusterCapacity = shared.instant('ceph-total-bytes', undefined, evalAt).then(
			(result) => first(result.result as Vector) || null,
			(error) => {
				console.warn('Failed to fetch cluster storage capacity:', error);
				return null;
			}
		);
		const [requested, count, usedRes, capacityRes, growthRes, clusterTotal] = await Promise.all([
			vector(
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			vector(`count(kube_persistentvolumeclaim_info{namespace="${ns}"}) or vector(0)`, evalAt),
			vector(used, evalAt),
			vector(
				`max by (persistentvolumeclaim) (last_over_time(kubelet_volume_stats_capacity_bytes{namespace="${ns}"}[5m])) ${live}`,
				evalAt
			),
			// Growth per day over the week, for volumes that report usage now.
			vector(
				`max by (persistentvolumeclaim) (deriv(kubelet_volume_stats_used_bytes{namespace="${ns}"}[7d])) * 86400 and on (persistentvolumeclaim) (${used})`,
				evalAt
			),
			clusterCapacity
		]);
		const usedBy = byClaim(usedRes);
		const capacityBy = byClaim(capacityRes);
		const growthBy = byClaim(growthRes);
		const volumes: VolumeReading[] = [...usedBy].flatMap(([name, value]) => {
			const capacity = capacityBy.get(name);
			return capacity === undefined
				? []
				: [{ name, capacity, used: value, growthPerDay: growthBy.get(name) ?? null }];
		});
		// Both end in `or vector(0)`, so a Prometheus that answers always returns a sample.
		if (requested.length === 0 || count.length === 0) return null;
		return {
			requested: first(requested),
			used: [...usedBy.values()].reduce((sum, value) => sum + value, 0),
			count: first(count),
			rows: fillingFirst(volumes),
			clusterTotal
		};
	}

	async function fetch() {
		if (!namespace) return;
		try {
			snap = await fetchStorage();
			hasError = false;
		} catch (error) {
			hasError = true;
			snap = undefined;
			console.error('Failed to fetch workspace storage metrics:', error);
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

	const GIB = 1024 ** 3;
	function scaleOf(bytes: number): { unit: string; divisor: number } {
		if (bytes >= 1024 * GIB) return { unit: 'TiB', divisor: 1024 * GIB };
		if (bytes >= GIB) return { unit: 'GiB', divisor: GIB };
		return { unit: 'MiB', divisor: 1024 ** 2 };
	}
	function amount(bytes: number, divisor: number): string {
		const v = bytes / divisor;
		if (v === 0) return '0';
		return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
	}

	const usedScale = $derived(scaleOf(snap?.used ?? 0));
	const requestedScale = $derived(scaleOf(snap?.requested ?? 0));
	const percentUsed = $derived(
		snap && snap.requested > 0 ? Math.min(100, (100 * snap.used) / snap.requested) : 0
	);

	/** The last two dash-separated parts stay whole; the rest gives way. */
	function splitTail(name: string): [string, string] {
		const parts = name.split('-');
		if (parts.length <= 3) return [name, ''];
		const tail = `-${parts.slice(-2).join('-')}`;
		return [name.slice(0, -tail.length), tail];
	}

	// A volume's share used: 80 % and up a warning, 90 % and up critical.
	function toneOf(percent: number): string {
		if (percent >= 90) return 'text-destructive';
		if (percent >= 80) return 'text-chart-1';
		return 'text-chart-2';
	}
</script>

<Panel
	title={m.workspace_storage_title()}
	description={m.workspace_storage_description()}
	state={namespace ? widgetState(isLoaded, !!snap, hasError) : 'ready'}
	class="min-h-[12.5rem] @2xl:min-h-[25.3125rem]"
>
	{#if !namespace}
		<p class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</p>
	{:else if snap}
		<div class="flex flex-1 flex-col gap-2.5 slashed-zero tabular-nums">
			<p class="flex min-w-0 flex-wrap items-baseline gap-x-2">
				<span class="text-[1.75rem] leading-[2.125rem] font-[350] tracking-tight"
					>{amount(snap.used, usedScale.divisor)} {usedScale.unit}</span
				>
				<span class="text-sm text-muted-foreground"
					>{m.workspace_storage_used_of_requested({
						total: `${amount(snap.requested, requestedScale.divisor)} ${requestedScale.unit}`
					})}</span
				>
			</p>
			<span class="relative block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
				<span
					class="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
					style:width="{percentUsed}%"
				></span>
			</span>
			{#if snap.clusterTotal !== null && snap.requested > snap.clusterTotal}
				{@const capacity = scaleOf(snap.clusterTotal)}
				<Status tone="warn" variant="dot" class="items-start whitespace-normal">
					{m.workspace_pvc_exceeds_cluster({
						capacity: `${amount(snap.clusterTotal, capacity.divisor)} ${capacity.unit}`
					})}
				</Status>
			{/if}
			<p class="text-xs leading-4 text-muted-foreground">
				{snap.count === 1
					? m.workspace_storage_pvc_note_one()
					: m.workspace_storage_pvc_note_many({ count: String(snap.count) })}
			</p>
			<!-- The volumes closest to full, each linking to its claim. -->
			{#if snap.rows.length > 0}
				<ul class="mt-1">
					{#each snap.rows as row (row.name)}
						{@const [head, tail] = splitTail(row.name)}
						<li
							class="flex min-h-[2.125rem] items-center justify-between gap-3 border-t border-border text-[0.8125rem]"
						>
							<OverviewLink
								target={detailLink(PVC, namespace, row.name)}
								names={[row.name]}
								class="flex min-w-0 font-mono text-[0.8125rem]"
							>
								<span class="truncate">{head}</span><span class="shrink-0">{tail}</span>
							</OverviewLink>
							<span class="shrink-0 {toneOf(row.percent)}">
								{Math.round(row.percent)}%{#if row.fullInDays !== null}
									· {m.workspace_storage_full_in({ days: String(row.fullInDays) })}{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</Panel>
