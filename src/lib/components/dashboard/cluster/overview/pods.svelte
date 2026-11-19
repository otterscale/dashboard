<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { fetchCombinedOrThrow } from '$lib/components/dashboard/shared/query';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { problemTone, type Tone } from '$lib/components/dashboard/shared/tone';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

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
	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		const ns = (namespace ?? '').trim();
		const nsFilter = ns ? `,namespace="${escapePromqlStringLiteral(ns)}"` : '';
		try {
			const r = await fetchCombinedOrThrow(prometheusDriver, {
				allocatable: `sum(kube_node_status_allocatable{resource="pods", container!=""})`,
				running: `sum(kube_pod_status_phase{phase="Running", container!=""${nsFilter}})`,
				pending: `sum(kube_pod_status_phase{phase="Pending", container!=""${nsFilter}})`,
				failed: `sum(kube_pod_status_phase{phase="Failed", container!=""${nsFilter}})`
			});
			maxAllocatablePods = r.allocatable[0]?.value ?? undefined;
			runningPods = r.running[0]?.value ?? undefined;
			pendingPods = r.pending[0]?.value ?? undefined;
			failedPods = r.failed[0]?.value ?? undefined;
			failed = false;
		} catch (error) {
			failed = true;
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

	const tileState = $derived(!isLoaded ? 'loading' : failed ? 'error' : empty ? 'empty' : 'ready');
	// The samples are assigned only inside fetch(), which the type checker does not follow:
	// read them through a typed parameter so they are not narrowed to `undefined` here.
	const read = (sample: SampleValue | undefined) => sample?.value;
	const figures = $derived<{ label: string; value: number | string | undefined; tone: Tone }[]>([
		{ label: m.pods_allocatable(), value: read(maxAllocatablePods), tone: 'default' },
		{ label: m.pods_running(), value: read(runningPods), tone: 'success' },
		{
			label: m.pods_pending(),
			value: read(pendingPods),
			tone: problemTone(Number(read(pendingPods) ?? 0), 'warning')
		},
		{
			label: m.pods_failed(),
			value: read(failedPods),
			tone: problemTone(Number(read(failedPods) ?? 0))
		}
	]);
</script>

<!-- Four cells of the band, not one: the widget's wrapper is `display: contents`. -->
{#each figures as figure (figure.label)}
	<StatTile
		label={figure.label}
		state={tileState}
		onretry={fetch}
		value={figure.value ?? 'N/A'}
		tone={figure.tone}
	/>
{/each}
