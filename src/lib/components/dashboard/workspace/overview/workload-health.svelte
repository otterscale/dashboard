<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		type ListRequest,
		type ListResponse,
		type Resource,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';

	type WorkloadListSpec = {
		group: string;
		version: string;
		resource: string;
	};

	/** Same GVR as console nav / model.svelte (ResourceService.list). */
	const WORKLOAD_SPECS: WorkloadListSpec[] = [
		{ group: 'serving.kserve.io', version: 'v1alpha2', resource: 'llminferenceservices' },
		{ group: 'helm.toolkit.fluxcd.io', version: 'v2', resource: 'helmreleases' }
	];

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

	const workloadLabels = $derived([m.model(), m.release()]);

	let rows: { label: string; ready: number; total: number }[] = $state([]);

	function hasReadyConditionTrue(obj: JsonObject | undefined): boolean {
		if (!obj || typeof obj !== 'object') return false;
		const status = (obj as Record<string, unknown>)['status'];
		if (!status || typeof status !== 'object') return false;
		const conditions = (status as Record<string, unknown>)['conditions'];
		if (!Array.isArray(conditions)) return false;
		for (const c of conditions) {
			if (!c || typeof c !== 'object') continue;
			const row = c as { type?: unknown; status?: unknown };
			if (row.type === 'Ready' && row.status === 'True') return true;
		}
		return false;
	}

	function totalsFromItems(items: Resource[]): { ready: number; total: number } {
		let ready = 0;
		for (const item of items) {
			if (hasReadyConditionTrue(item.object)) ready++;
		}
		return { ready, total: items.length };
	}

	async function listAllInNamespace(spec: WorkloadListSpec, ns: string): Promise<Resource[]> {
		const out: Resource[] = [];
		let continueToken: string | undefined = undefined;
		for (;;) {
			const response: ListResponse = await resourceClient.list({
				cluster,
				namespace: ns,
				group: spec.group,
				version: spec.version,
				resource: spec.resource,
				limit: BigInt(500),
				continue: continueToken
			} as ListRequest);
			out.push(...response.items);
			continueToken = response.continue || undefined;
			if (!continueToken) break;
		}
		return out;
	}

	async function fetchWorkloadSafe(
		spec: WorkloadListSpec,
		label: string,
		ns: string
	): Promise<{ label: string; ready: number; total: number }> {
		try {
			const items = await listAllInNamespace(spec, ns);
			const { ready, total } = totalsFromItems(items);
			return { label, ready, total };
		} catch (error) {
			console.error(
				`Failed to list ${spec.group}/${spec.version}/${spec.resource} in namespace ${ns}:`,
				error
			);
			return { label, ready: 0, total: 0 };
		}
	}

	async function fetch() {
		if (!namespace || !cluster) {
			rows = [];
			return;
		}
		const labels = workloadLabels;
		try {
			rows = await Promise.all(
				WORKLOAD_SPECS.map((w, i) => fetchWorkloadSafe(w, labels[i]!, namespace))
			);
		} catch (error) {
			console.error('Failed to fetch workspace workload health:', error);
			rows = WORKLOAD_SPECS.map((_, i) => ({
				label: labels[i]!,
				ready: 0,
				total: 0
			}));
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

	$effect(() => {
		void cluster;
		void namespace;
		if (isLoaded) fetch();
	});

	let isLoaded = $state(false);
	onMount(async () => {
		// widget-grid passes prometheusDriver to every tile; this widget uses Resource API only.
		void prometheusDriver;
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Panel
	title={m.workspace_workload_health_title()}
	description={m.workspace_workload_health_description()}
	state={namespace ? widgetState(isLoaded, rows.length > 0) : 'ready'}
	class="min-h-[13.625rem] @md:min-h-[13.875rem]"
>
	{#if !namespace}
		<p class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</p>
	{:else}
		<!-- One row per kind, laid out like the quota card beside it. A ready count is a number,
		     not a capacity, so there is no bar: only an amber mark when some are not ready. -->
		<ul class="flex flex-1 flex-col slashed-zero tabular-nums">
			{#each rows as row (row.label)}
				<li
					class="flex flex-1 items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
				>
					<p class="min-w-0 truncate text-sm font-medium" title={row.label}>{row.label}</p>
					{#if row.total === 0}
						<!-- Nothing of this kind is deployed: not a zero to read, so a word. -->
						<p class="shrink-0 text-sm text-muted-foreground">{m.dashboard_none()}</p>
					{:else}
						<p class="shrink-0 text-2xl leading-8 tracking-tight">
							{#if row.ready < row.total}
								<Status tone="warn" variant="dot" class="text-2xl leading-8">{row.ready}</Status>
							{:else}
								{row.ready}
							{/if}<span class="ml-1 text-xs tracking-normal text-muted-foreground"
								>/ {row.total} {m.ready()}</span
							>
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Panel>
