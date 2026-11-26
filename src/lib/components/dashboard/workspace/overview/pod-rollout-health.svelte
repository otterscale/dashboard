<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount, type Snippet } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

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
	// Most of the queries end in `or vector(0)`, so a Prometheus that answers always returns a
	// sample. No sample from any of them means there is nothing to show, not sixteen zeros.
	let hasSeries = $state(false);

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

		hasSeries = results.some((r) => r.result.length > 0);
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

	async function fetch() {
		try {
			if (!namespace) {
				snap = undefined;
				return;
			}
			await fetchAll(namespace);
		} catch (error) {
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

	// The one number worth a look first: pods that are not ready plus containers stuck or killed.
	const attention = $derived.by(() => {
		const s = snap;
		return s === undefined ? 0 : s.notReady + containerIssueTotal;
	});

	const detailState = $derived(
		namespace ? widgetState(isLoaded, snap !== undefined && hasSeries) : 'empty'
	);

	// A count's colour carries its state; the label beside it says what the count is.
	function toneText(tone: DetailRow['tone']): string {
		if (tone === 'ok') return 'text-chart-2';
		if (tone === 'warn') return 'text-chart-1';
		if (tone === 'bad') return 'text-destructive';
		return '';
	}

	type DetailRow = {
		label: string;
		value: number;
		/** Colour and mark to use when the count is above zero. */
		tone?: 'ok' | 'warn' | 'bad';
	};
	type RolloutRow = { label: string; ready: number; desired: number };
	const podRows = $derived.by((): DetailRow[] =>
		snap
			? [
					{ label: m.workspace_pods_running(), value: snap.running, tone: 'ok' },
					{ label: m.workspace_pods_unknown(), value: snap.unknown },
					{ label: m.workspace_pods_not_ready(), value: snap.notReady, tone: 'warn' },
					{ label: m.workspace_pod_rollout_kpi_issues(), value: containerIssueTotal, tone: 'bad' },
					{ label: m.workspace_pods_succeeded(), value: snap.succeeded }
				]
			: []
	);
	const containerRows = $derived.by((): DetailRow[] =>
		snap
			? [
					{ label: m.workspace_containers_crashloop(), value: snap.crashLoop, tone: 'bad' },
					{ label: m.workspace_containers_image_pull(), value: snap.imagePull, tone: 'bad' },
					{ label: m.workspace_containers_config_error(), value: snap.configError, tone: 'bad' },
					{ label: m.workspace_containers_oom_killed(), value: snap.oomKilled, tone: 'bad' }
				]
			: []
	);
	const rolloutRows = $derived.by((): RolloutRow[] =>
		snap
			? [
					{ label: m.deployment(), ready: snap.deployReady, desired: snap.deployDesired },
					{ label: m.stateful_set(), ready: snap.stsReady, desired: snap.stsDesired },
					{ label: m.daemon_set(), ready: snap.dsReady, desired: snap.dsDesired }
				]
			: []
	);
	const rolloutCounts = $derived.by((): DetailRow[] =>
		snap
			? [
					{ label: m.workspace_pvc_pending(), value: snap.pvcPending, tone: 'warn' },
					{ label: m.workspace_job_failed_pods(), value: snap.jobFailed, tone: 'bad' }
				]
			: []
	);
</script>

{#snippet countRow(row: DetailRow)}
	<li class="flex h-9 items-center justify-between gap-3">
		<span class="min-w-0 truncate" title={row.label}>{row.label}</span>
		<!-- Zero is the normal case for most of these counters, so it is quiet. -->
		{#if row.value === 0}
			<span class="shrink-0 font-medium text-muted-foreground">0</span>
		{:else}
			<!-- The number alone, in its state's colour: no mark beside it. -->
			<span class="shrink-0 font-medium {toneText(row.tone)}">{row.value}</span>
		{/if}
	</li>
{/snippet}

{#snippet section(title: string, icon: typeof LayoutGridIcon, rows: Snippet)}
	{@const Icon = icon}
	<section class="min-w-0">
		<h3 class="flex items-center gap-2 text-sm font-[550]">
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<Icon class="size-4" aria-hidden="true" />
			</span>
			{title}
		</h3>
		<ul class="mt-2 divide-y divide-border text-sm">
			{@render rows()}
		</ul>
	</section>
{/snippet}

<Panel
	title={m.workspace_pod_rollout_health_title()}
	description={m.workspace_pod_rollout_health_description()}
	state={detailState}
	class="min-h-[61.75rem] @md:min-h-[62rem] @3xl:min-h-[25rem]"
>
	{#if snap}
		<div class="flex flex-col gap-3 slashed-zero tabular-nums">
			<!-- The first block is the verdict, and its colour is the state: mint while nothing needs
			     a look, the attention colour once something does. The rest are the counts behind it. -->
			<div class="grid grid-cols-2 gap-2 @md/panel:grid-cols-3 @2xl/panel:grid-cols-6">
				<div
					class="col-span-2 rounded-lg px-3 py-2.5 {attention === 0
						? 'bg-mint text-mint-foreground'
						: 'bg-attention text-attention-foreground'}"
				>
					<p class="truncate text-xs leading-4 opacity-70">{m.dashboard_pods_need_attention()}</p>
					<p class="mt-1 flex items-center gap-2 text-2xl leading-8 tracking-tight">
						<span
							class="size-2 shrink-0 rounded-full {attention === 0 ? 'bg-chart-2' : 'bg-chart-1'}"
						></span>
						{attention === 0 ? m.dashboard_all_clear() : attention}
					</p>
				</div>
				{#each podRows.filter((row) => row.label !== m.workspace_pods_unknown()) as row (row.label)}
					<div class="border-l border-border py-1 pl-3">
						<p class="truncate text-xs leading-4 text-muted-foreground" title={row.label}>
							{row.label}
						</p>
						<p class="mt-1 text-2xl leading-8 tracking-tight">
							{#if row.value === 0}
								<span class="text-muted-foreground">0</span>
							{:else}
								<span class={toneText(row.tone)}>{row.value}</span>
							{/if}
						</p>
					</div>
				{/each}
			</div>
			<div class="grid gap-x-8 gap-y-4 border-t border-border pt-3 @2xl/panel:grid-cols-3">
				{#snippet podList()}
					{#each podRows.filter((row) => row.label !== m.workspace_pod_rollout_kpi_issues()) as row (row.label)}
						{@render countRow(row)}
					{/each}
				{/snippet}
				{@render section(m.workspace_health_section_pods(), LayoutGridIcon, podList)}
				{#snippet containerList()}
					{#each containerRows as row (row.label)}
						{@render countRow(row)}
					{/each}
				{/snippet}
				{@render section(m.workspace_health_section_containers(), CircleAlertIcon, containerList)}
				{#snippet rolloutList()}
					{#each rolloutRows as row (row.label)}
						<li class="flex h-9 items-center justify-between gap-3">
							<span class="min-w-0 truncate" title={row.label}>{row.label}</span>
							{#if row.desired === 0}
								<span class="shrink-0 text-muted-foreground">{m.dashboard_none()}</span>
							{:else if row.ready < row.desired}
								<!-- A ready count is a number, not a capacity: no bar, only amber when short. -->
								<span class="shrink-0 font-medium {toneText('warn')}"
									>{ratio(row.ready, row.desired)}</span
								>
							{:else}
								<span class="shrink-0 font-medium">{ratio(row.ready, row.desired)}</span>
							{/if}
						</li>
					{/each}
					{#each rolloutCounts as row (row.label)}
						{@render countRow(row)}
					{/each}
				{/snippet}
				{@render section(m.workspace_health_section_rollouts(), RocketIcon, rolloutList)}
			</div>
		</div>
	{/if}
</Panel>
