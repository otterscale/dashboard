<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import {
		NUM,
		Panel,
		Status,
		TONE_DOT,
		TONE_TEXT,
		widgetState
	} from '$lib/components/dashboard/kit';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { listWorkspaceObjects } from '../lib/resources';
	import {
		DEPLOYMENT,
		detailLink,
		HELM_RELEASE,
		type LinkTarget,
		LLM_INFERENCE_SERVICE,
		STATEFUL_SET
	} from './links';
	import OverviewLink from './overview-link.svelte';
	import {
		classifyWorkloads,
		notReady,
		summarize,
		type Workload,
		type WorkloadKind
	} from './workload-status';

	// widget-grid also passes `prometheusDriver` to every tile; this one reads the Resource API
	// only, so it does not take it.
	let {
		cluster,
		namespace,
		isReloading = $bindable()
	}: {
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

	let workloads = $state.raw<Workload[] | undefined>(undefined);
	let hasError = $state(false);
	let expanded = $state(false);

	async function fetch() {
		if (!namespace || !cluster) return;
		try {
			workloads = classifyWorkloads(
				await listWorkspaceObjects(resourceClient, cluster, namespace),
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
		<div class={cn('flex flex-1 flex-col', NUM)}>
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
							<p class={cn('flex shrink-0 items-center gap-1.5', TONE_TEXT[row.tone])}>
								<span class={cn('size-2 rounded-full', TONE_DOT[row.tone])} aria-hidden="true"
								></span>
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
								<!-- The dot is the state's colour; the name beside it stays the text colour. -->
								<Status
									{tone}
									variant="dot"
									class="flex min-w-0 gap-2 text-[0.8125rem] text-foreground"
								>
									<OverviewLink
										target={linkOf(workload)}
										names={[workload.name]}
										class="truncate font-mono text-[0.8125rem]"
									>
										{workload.name}
									</OverviewLink>
								</Status>
								<span class={cn('whitespace-nowrap', TONE_TEXT[tone])}>{workload.reason}</span>
							</li>
						{/each}
					</ul>
					{#if problems.length > CAP}
						<Button
							variant="link"
							size="sm"
							class="mt-1 self-start px-0 text-[0.8125rem] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground hover:decoration-current"
							aria-expanded={showAll}
							onclick={() => (expanded = !showAll)}
						>
							{showAll
								? m.workspace_workload_show_fewer()
								: m.workspace_workload_show_all({ count: String(problems.length) })}
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</Panel>
