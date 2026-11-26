<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		type ListRequest,
		type ListResponse,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { WorkspaceReleaseLabelSelector } from '$lib/utils/helm-release';

	import {
		DEPLOYMENT,
		detailLink,
		HELM_RELEASE,
		type LinkTarget,
		LLM_INFERENCE_SERVICE,
		POD,
		type ResourceKind,
		STATEFUL_SET
	} from './links';
	import OverviewLink from './overview-link.svelte';
	import {
		classifyWorkloads,
		notReady,
		summarize,
		type Workload,
		type WorkloadKind,
		type WorkspaceObjects
	} from './workload-status';

	let {
		prometheusDriver,
		cluster,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		isReloading: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	/**
	 * Not-ready workloads shown before "Show all". While the cards sit side by side their
	 * min-height is this card with four of them and the toggle, so a long list does not make the
	 * row grow; stacked, each card keeps its own height.
	 */
	const CAP = 4;

	let workloads = $state<Workload[] | undefined>(undefined);
	let hasError = $state(false);
	let expanded = $state(false);

	async function listAll(kind: ResourceKind, labelSelector?: string): Promise<unknown[]> {
		const out: unknown[] = [];
		let continueToken: string | undefined = undefined;
		for (;;) {
			const response: ListResponse = await resourceClient.list({
				cluster,
				namespace,
				group: kind.group,
				version: kind.version,
				resource: kind.resource,
				labelSelector,
				limit: BigInt(500),
				continue: continueToken
			} as ListRequest);
			out.push(...response.items.map((item) => item.object));
			continueToken = response.continue || undefined;
			if (!continueToken) break;
		}
		return out;
	}

	async function fetch() {
		if (!namespace || !cluster) return;
		try {
			const [models, releases, deployments, statefulSets, pods] = await Promise.all([
				listAll(LLM_INFERENCE_SERVICE),
				// The workspace's own releases, as the sidebar's Release page lists them.
				listAll(HELM_RELEASE, WorkspaceReleaseLabelSelector),
				listAll(DEPLOYMENT),
				listAll(STATEFUL_SET),
				listAll(POD)
			]);
			workloads = classifyWorkloads(
				{ models, releases, deployments, statefulSets, pods } as WorkspaceObjects,
				Date.now()
			);
			hasError = false;
		} catch (error) {
			hasError = true;
			workloads = undefined;
			console.error('Failed to fetch workspace workload health:', error);
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
		// widget-grid passes prometheusDriver to every tile; this widget uses the Resource API only.
		void prometheusDriver;
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	const KINDS: { kind: WorkloadKind; label: () => string }[] = [
		{ kind: 'model', label: () => m.models() },
		{ kind: 'release', label: () => m.workspace_workload_releases() },
		{ kind: 'other', label: () => m.workspace_workload_other() }
	];

	const summaries = $derived(
		KINDS.map(({ kind, label }) => ({ kind, label: label(), ...summarize(workloads ?? [], kind) }))
	);
	const problems = $derived(notReady(workloads ?? []));
	// Expanded only while there is more to show than the cap.
	const showAll = $derived(expanded && problems.length > CAP);
	const shown = $derived(showAll ? problems : problems.slice(0, CAP));

	function linkOf(workload: Workload): LinkTarget {
		if (workload.kind === 'model')
			return detailLink(LLM_INFERENCE_SERVICE, namespace, workload.name);
		if (workload.kind === 'release') return detailLink(HELM_RELEASE, namespace, workload.name);
		return detailLink(
			workload.resource === 'statefulsets' ? STATEFUL_SET : DEPLOYMENT,
			namespace,
			workload.name
		);
	}

	const TONE_TEXT = { bad: 'text-destructive', warn: 'text-chart-1', ok: 'text-chart-2' };
	const TONE_DOT = { bad: 'bg-destructive', warn: 'bg-chart-1', ok: 'bg-chart-2' };
	const stateTone = (workload: Workload) => (workload.state === 'failing' ? 'bad' : 'warn');
</script>

<Panel
	title={m.workspace_workload_health_title()}
	description={m.workspace_workload_health_description()}
	state={namespace ? widgetState(isLoaded, workloads !== undefined, hasError) : 'ready'}
	class="min-h-[14.5rem] @2xl:min-h-[25.3125rem]"
>
	{#if !namespace}
		<p class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</p>
	{:else}
		<div class="flex flex-1 flex-col slashed-zero tabular-nums">
			<!-- One row per kind: its name and how many are ready, the dot in the worst state's colour. -->
			<ul>
				{#each summaries as row (row.kind)}
					<li
						class="flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-border first:border-t-0"
					>
						<p class="min-w-0 truncate text-sm font-medium">{row.label}</p>
						{#if row.total === 0}
							<!-- Nothing of this kind is deployed: not a zero to read, so a word. -->
							<p class="shrink-0 text-sm text-muted-foreground">{m.dashboard_none()}</p>
						{:else}
							<p class="flex shrink-0 items-center gap-1.5 {TONE_TEXT[row.tone]}">
								<span class="size-2 rounded-full {TONE_DOT[row.tone]}" aria-hidden="true"></span>
								<span class="text-lg leading-6 tracking-tight"
									>{m.workspace_workload_ready_ratio({
										ready: String(row.ready),
										total: String(row.total)
									})}</span
								>
								<span class="text-xs text-muted-foreground">{m.ready()}</span>
							</p>
						{/if}
					</li>
				{/each}
			</ul>
			<!-- What is not ready, failing first; nothing at all while everything is. -->
			{#if problems.length > 0}
				<div class="flex flex-col border-t border-border pt-2">
					<ul>
						{#each shown as workload (workload.kind + '/' + workload.name)}
							{@const tone = stateTone(workload)}
							<li
								class="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[0.8125rem]"
							>
								<span class="flex min-w-0 items-center gap-2">
									<span class="size-1.5 shrink-0 rounded-full {TONE_DOT[tone]}" aria-hidden="true"
									></span>
									<OverviewLink
										target={linkOf(workload)}
										names={[workload.name]}
										class="truncate font-mono text-[0.8125rem]"
									>
										{workload.name}
									</OverviewLink>
								</span>
								<span class="whitespace-nowrap {TONE_TEXT[tone]}">{workload.reason}</span>
							</li>
						{/each}
					</ul>
					{#if problems.length > CAP}
						<button
							type="button"
							class="mt-1 min-h-8 self-start rounded-sm text-[0.8125rem] font-medium text-muted-foreground underline decoration-border underline-offset-[3px] outline-none hover:text-foreground hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring"
							aria-expanded={showAll}
							onclick={() => (expanded = !showAll)}
						>
							{showAll
								? m.workspace_workload_show_fewer()
								: m.workspace_workload_show_all({ count: String(problems.length) })}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</Panel>
