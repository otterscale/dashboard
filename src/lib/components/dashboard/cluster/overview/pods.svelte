<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { PrometheusDriver } from 'prometheus-query';

	import InfoTip from '$lib/components/dashboard/shared/info-tip.svelte';
	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import {
		cardClass,
		dataTable,
		type Level,
		levelOfCount,
		levelText
	} from '$lib/components/dashboard/shared/status';
	import WidgetState from '$lib/components/dashboard/shared/widget-state.svelte';
	import { Card } from '$lib/components/shadcnio/card';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstantOrNull } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		namespace = '',
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace?: string;
		isReloading: boolean;
	} = $props();

	function finite(value: unknown): number | undefined {
		const n = Number(value);
		return value !== undefined && value !== null && Number.isFinite(n) ? n : undefined;
	}

	// Allocatable + the three pod phases come back in a single `or`-unioned instant query.
	const pods = useLoadable(
		async () => {
			const ns = (namespace ?? '').trim();
			const nsFilter = ns ? `,namespace="${escapePromqlStringLiteral(ns)}"` : '';
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					allocatable: `sum(kube_node_status_allocatable{resource="pods", container!=""})`,
					running: `sum(kube_pod_status_phase{phase="Running", container!=""${nsFilter}})`,
					pending: `sum(kube_pod_status_phase{phase="Pending", container!=""${nsFilter}})`,
					failed: `sum(kube_pod_status_phase{phase="Failed", container!=""${nsFilter}})`
				})
			);
			const allocatable = finite(r.allocatable[0]?.value?.value);
			const running = finite(r.running[0]?.value?.value);
			const pending = finite(r.pending[0]?.value?.value);
			const failed = finite(r.failed[0]?.value?.value);
			if (allocatable === undefined && running === undefined && pending === undefined) return null;
			return { allocatable, running, pending, failed };
		},
		() => isReloading
	);

	// Running is the normal case and Allocatable is a capacity: neither is coloured.
	// Pending and Failed pick up a colour only once there is something in them.
	const readings = $derived<{ label: string; value: number | undefined; level: Level }[]>([
		{ label: m.dash_pods_allocatable(), value: pods.data?.allocatable, level: 'neutral' },
		{ label: m.running(), value: pods.data?.running, level: 'neutral' },
		{
			label: m.dash_pods_pending(),
			value: pods.data?.pending,
			level: levelOfCount(pods.data?.pending ?? 0, 'warn')
		},
		{
			label: m.dash_pods_failed(),
			value: pods.data?.failed,
			level: levelOfCount(pods.data?.failed ?? 0, 'danger')
		}
	]);
</script>

<!-- The stat tile, with four readings where the others have one. Same line heights as
     StatCard, so the row of tiles lines up. -->
<Card class={cn(cardClass, '@container/pods justify-center')} data-status={pods.status}>
	<div class="flex min-w-0 items-start gap-4 px-(--card-spacing)">
		<div
			class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
			aria-hidden="true"
		>
			<BoxIcon class="size-5" />
		</div>
		<div class="grid min-w-0 flex-1 gap-1">
			<div class="flex min-h-6 min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
				<span class="truncate">{m.pods()}</span>
				{#if pods.stale}
					<InfoTip
						text={m.dash_state_stale()}
						icon={TriangleAlertIcon}
						class="text-warning-foreground hover:text-warning-foreground"
					/>
				{/if}
			</div>
			{#if pods.status === 'error' || pods.status === 'empty'}
				<div class="flex min-h-8 min-w-0 items-center">
					<WidgetState kind={pods.status} compact />
				</div>
				<div class="min-h-5"></div>
			{:else}
				<dl class="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 @md/pods:grid-cols-4">
					{#each readings as reading (reading.label)}
						<div class="flex min-w-0 flex-col-reverse gap-1">
							<dt class="min-h-5 truncate text-xs text-muted-foreground">{reading.label}</dt>
							<dd
								class={cn(
									'flex min-h-8 items-center text-2xl leading-8 font-medium tabular-nums',
									levelText[reading.level]
								)}
							>
								{#if pods.status === 'loading'}
									<Skeleton class="h-6 w-14" />
								{:else if reading.value === undefined}
									<span class={dataTable.absent}>—</span>
								{:else}
									{reading.value}
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	</div>
</Card>
