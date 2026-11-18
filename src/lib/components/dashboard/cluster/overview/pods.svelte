<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import {
		problemTone,
		type Tone,
		toneFill,
		toneText
	} from '$lib/components/dashboard/shared/tone';
	import { Status } from '$lib/components/shadcnio/status';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstant } from '$lib/prometheus';
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

	let maxAllocatablePods: SampleValue | undefined = $state(undefined);
	let runningPods: SampleValue | undefined = $state(undefined);
	let pendingPods: SampleValue | undefined = $state(undefined);
	let failedPods: SampleValue | undefined = $state(undefined);

	// Allocatable + the three pod phases come back in a single `or`-unioned instant query.
	async function fetch() {
		const ns = (namespace ?? '').trim();
		const nsFilter = ns ? `,namespace="${escapePromqlStringLiteral(ns)}"` : '';
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				allocatable: `sum(kube_node_status_allocatable{resource="pods", container!=""})`,
				running: `sum(kube_pod_status_phase{phase="Running", container!=""${nsFilter}})`,
				pending: `sum(kube_pod_status_phase{phase="Pending", container!=""${nsFilter}})`,
				failed: `sum(kube_pod_status_phase{phase="Failed", container!=""${nsFilter}})`
			});
			maxAllocatablePods = r.allocatable[0]?.value ?? undefined;
			runningPods = r.running[0]?.value ?? undefined;
			pendingPods = r.pending[0]?.value ?? undefined;
			failedPods = r.failed[0]?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch pods:', error);
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

	const empty = $derived(!maxAllocatablePods && !runningPods && !pendingPods);
</script>

{#snippet figure(label: string, value: number | string | undefined, tone: Tone)}
	<div class="min-w-0">
		<p class={cn('text-2xl leading-8 font-semibold tracking-tight tabular-nums', toneText[tone])}>
			{value ?? 'N/A'}
		</p>
		<p class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
			<Status size="sm" class={cn('ring-0', toneFill[tone === 'default' ? 'muted' : tone])} />
			{label}
		</p>
	</div>
{/snippet}

<StatTile
	label={m.pods()}
	icon={BoxIcon}
	tone="primary"
	loading={!isLoaded}
	hint={empty ? m.no_data_display() : undefined}
	value={empty ? null : undefined}
>
	{#if !empty}
		<div class="grid grid-cols-4 gap-3">
			{@render figure('Allocatable', maxAllocatablePods?.value, 'default')}
			{@render figure('Running', runningPods?.value, 'success')}
			{@render figure(
				'Pending',
				pendingPods?.value,
				problemTone(Number(pendingPods?.value ?? 0), 'warning')
			)}
			{@render figure('Failed', failedPods?.value, problemTone(Number(failedPods?.value ?? 0)))}
		</div>
	{/if}
</StatTile>
