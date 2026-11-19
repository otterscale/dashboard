<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
	import Rocket from '@lucide/svelte/icons/rocket';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { type Component, onDestroy, onMount, type Snippet } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import Band from '$lib/components/dashboard/shared/band.svelte';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { problemTone, type Tone, toneText } from '$lib/components/dashboard/shared/tone';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		isReloading: boolean;
	} = $props();

	type PodRolloutSnapshot = {
		running: number;
		unknown: number;
		notReady: number;
		succeeded: number;
		crashLoop: number;
		imagePull: number;
		configError: number;
		deployReady: number;
		deployDesired: number;
		stsReady: number;
		stsDesired: number;
		dsReady: number;
		dsDesired: number;
		pvcPending: number;
		jobFailed: number;
		oomKilled: number;
	};

	let snap: PodRolloutSnapshot | undefined = $state(undefined);

	function num(v: SampleValue | undefined): number {
		if (v?.value === undefined || v?.value === null) return 0;
		const n = Number(v.value);
		return Number.isFinite(n) ? Math.round(n) : 0;
	}

	const containerIssueTotal = $derived.by(() => {
		const s = snap;
		if (s === undefined) return 0;
		return s.crashLoop + s.imagePull + s.configError + s.oomKilled;
	});

	async function fetchAll(ns: string) {
		const n = escapePromqlStringLiteral(ns);
		const base = `namespace="${n}"`;

		const q = [
			`sum(kube_pod_status_phase{${base}, phase="Running", container!=""})`,
			`sum(kube_pod_status_phase{${base}, phase="Unknown", container!=""})`,
			`sum(kube_pod_status_condition{${base}, condition="Ready", status="false"}) or vector(0)`,
			`sum(kube_pod_status_phase{${base}, phase="Succeeded", container!=""})`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="CrashLoopBackOff"}) or vector(0)`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="ImagePullBackOff"}) or vector(0)`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="CreateContainerConfigError"}) or vector(0)`,
			`sum(kube_deployment_status_replicas_available{${base}}) or vector(0)`,
			`sum(kube_deployment_spec_replicas{${base}}) or vector(0)`,
			`sum(kube_statefulset_status_replicas_ready{${base}}) or vector(0)`,
			`sum(kube_statefulset_replicas{${base}}) or vector(0)`,
			`sum(kube_daemonset_status_number_ready{${base}}) or vector(0)`,
			`sum(kube_daemonset_status_desired_number_scheduled{${base}}) or vector(0)`,
			`count(kube_persistentvolumeclaim_status_phase{${base}, phase="Pending"} == 1) or vector(0)`,
			`sum(kube_job_status_failed{${base}}) or vector(0)`,
			`sum(kube_pod_container_status_last_terminated_reason{${base}, reason="OOMKilled"}) or vector(0)`
		];

		const evalAt = new Date();
		const results = await Promise.all(
			q.map((query) => prometheusDriver.instantQuery(query, evalAt))
		);

		snap = {
			running: num(results[0]?.result[0]?.value),
			unknown: num(results[1]?.result[0]?.value),
			notReady: num(results[2]?.result[0]?.value),
			succeeded: num(results[3]?.result[0]?.value),
			crashLoop: num(results[4]?.result[0]?.value),
			imagePull: num(results[5]?.result[0]?.value),
			configError: num(results[6]?.result[0]?.value),
			deployReady: num(results[7]?.result[0]?.value),
			deployDesired: num(results[8]?.result[0]?.value),
			stsReady: num(results[9]?.result[0]?.value),
			stsDesired: num(results[10]?.result[0]?.value),
			dsReady: num(results[11]?.result[0]?.value),
			dsDesired: num(results[12]?.result[0]?.value),
			pvcPending: num(results[13]?.result[0]?.value),
			jobFailed: num(results[14]?.result[0]?.value),
			oomKilled: num(results[15]?.result[0]?.value)
		};
	}

	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			if (!namespace) {
				snap = undefined;
				return;
			}
			await fetchAll(namespace);
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch namespace pod & rollout health:', error);
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

	function ratio(ready: number, desired: number): string {
		return m.workspace_workload_ready_ratio({
			ready: String(ready),
			total: String(desired)
		});
	}

	/** A rollout with nothing desired is not a problem; one short of its replicas is. */
	function rolloutTone(ready: number, desired: number): Tone {
		if (desired === 0) return 'muted';
		return ready >= desired ? 'default' : 'warning';
	}

	type Kpi = {
		label: string;
		value: number | null;
		tone: Tone;
	};
	// Always four tiles, so the row keeps its shape while loading and when there is no data.
	const kpis = $derived.by((): Kpi[] => [
		{
			label: m.workspace_pods_running(),
			value: snap?.running ?? null,
			tone: snap ? 'success' : 'muted'
		},
		{
			label: m.workspace_pods_not_ready(),
			value: snap?.notReady ?? null,
			tone: problemTone(snap?.notReady ?? 0, 'warning')
		},
		{
			label: m.workspace_pod_rollout_kpi_issues(),
			value: snap ? containerIssueTotal : null,
			tone: problemTone(containerIssueTotal)
		},
		{
			label: m.workspace_pods_succeeded(),
			value: snap?.succeeded ?? null,
			tone: 'default'
		}
	]);
</script>

{#snippet row(label: string, value: string | number, tone: Tone = 'default')}
	<div class="flex items-center justify-between gap-3 py-2">
		<dt class="min-w-0 truncate text-muted-foreground">{label}</dt>
		<dd class={cn('shrink-0 font-medium tabular-nums', toneText[tone])}>{value}</dd>
	</div>
{/snippet}

{#snippet section(title: string, Icon: Component<{ class?: string }>, rows: Snippet)}
	<section class="min-w-0 py-4 first:pt-0 last:pb-0 lg:px-5 lg:py-0 lg:first:ps-0 lg:last:pe-0">
		<h3 class="mb-1 flex items-center gap-2 text-sm font-medium">
			<Icon class="size-4 text-muted-foreground" />
			{title}
		</h3>
		<dl class="divide-y text-sm">
			{@render rows()}
		</dl>
	</section>
{/snippet}

<!-- Two grid items in the page's grid: the headline counts lead the page, the breakdown closes it. -->
<div class="order-1 col-span-full">
	<Band class="grid-cols-2 lg:grid-cols-4">
		{#each kpis as kpi (kpi.label)}
			<StatTile
				label={kpi.label}
				value={kpi.value}
				tone={kpi.tone}
				state={!namespace || !isLoaded ? 'loading' : failed ? 'error' : !snap ? 'empty' : 'ready'}
				onretry={fetch}
			/>
		{/each}
	</Band>
</div>

<div class="order-5 col-span-full">
	<WidgetCard
		title={m.workspace_pod_rollout_health_title()}
		description={m.workspace_pod_rollout_health_description()}
		state={!namespace
			? 'message'
			: !isLoaded
				? 'loading'
				: failed
					? 'error'
					: !snap
						? 'empty'
						: 'ready'}
		onretry={fetch}
		message={m.workspace_namespace_unresolved()}
		contentClass="grid divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0"
	>
		{#if snap}
			{@const s = snap}
			{#snippet pods()}
				{@render row(m.workspace_pods_running(), s.running, 'success')}
				{@render row(m.workspace_pods_unknown(), s.unknown, problemTone(s.unknown, 'warning'))}
				{@render row(m.workspace_pods_not_ready(), s.notReady, problemTone(s.notReady, 'warning'))}
				{@render row(m.workspace_pods_succeeded(), s.succeeded)}
			{/snippet}
			{#snippet containers()}
				{@render row(m.workspace_containers_crashloop(), s.crashLoop, problemTone(s.crashLoop))}
				{@render row(m.workspace_containers_image_pull(), s.imagePull, problemTone(s.imagePull))}
				{@render row(
					m.workspace_containers_config_error(),
					s.configError,
					problemTone(s.configError)
				)}
				{@render row(m.workspace_containers_oom_killed(), s.oomKilled, problemTone(s.oomKilled))}
			{/snippet}
			{#snippet rollouts()}
				{@render row(
					m.deployment(),
					ratio(s.deployReady, s.deployDesired),
					rolloutTone(s.deployReady, s.deployDesired)
				)}
				{@render row(
					m.stateful_set(),
					ratio(s.stsReady, s.stsDesired),
					rolloutTone(s.stsReady, s.stsDesired)
				)}
				{@render row(
					m.daemon_set(),
					ratio(s.dsReady, s.dsDesired),
					rolloutTone(s.dsReady, s.dsDesired)
				)}
				{@render row(m.workspace_pvc_pending(), s.pvcPending, problemTone(s.pvcPending, 'warning'))}
				{@render row(m.workspace_job_failed_pods(), s.jobFailed, problemTone(s.jobFailed))}
			{/snippet}
			{@render section(m.workspace_health_section_pods(), LayoutGrid, pods)}
			{@render section(m.workspace_health_section_containers(), OctagonAlert, containers)}
			{@render section(m.workspace_health_section_rollouts(), Rocket, rollouts)}
		{/if}
	</WidgetCard>
</div>
