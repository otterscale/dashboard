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
	import Band from '$lib/components/dashboard/shared/band.svelte';
	import { toneFill } from '$lib/components/dashboard/shared/tone';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Status } from '$lib/components/shadcnio/status';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	type WorkloadListSpec = {
		group: string;
		version: string;
		resource: string;
	};

	/** Same GVR as console nav / model.svelte (ResourceService.list). */
	const WORKLOAD_SPECS: WorkloadListSpec[] = [
		{ group: 'serving.kserve.io', version: 'v1alpha2', resource: 'llminferenceservices' },
		{ group: 'kro.run', version: 'v1alpha1', resource: 'applications' },
		{ group: 'helm.toolkit.fluxcd.io', version: 'v2', resource: 'helmreleases' },
		{ group: 'kubevirt.io', version: 'v1', resource: 'virtualmachines' }
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

	const workloadLabels = $derived([
		m.model(),
		m.application(),
		m.release(),
		m.workspace_workload_vm_label()
	]);

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

<!-- From shadcn.io stats-kpi-status-tile-grid: a status word per tile, and a tile that is fine
     stays uncolored. -->
<WidgetCard
	title={m.workspace_workload_health_title()}
	description={m.workspace_workload_health_description()}
	state={!namespace ? 'message' : !isLoaded ? 'loading' : 'ready'}
	message={m.workspace_namespace_unresolved()}
	flush
>
	<Band inset class="grid-cols-1">
		{#each rows as row (row.label)}
			{@const none = row.total === 0}
			{@const ready = !none && row.ready >= row.total}
			<div
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-card px-(--card-spacing) py-3"
			>
				<div class="min-w-0">
					<h3 class="truncate text-sm font-medium">{row.label}</h3>
					<p class="mt-0.5 flex items-center gap-1.5 text-xs">
						<Status
							size="sm"
							class={cn('ring-0', toneFill[none ? 'muted' : ready ? 'success' : 'warning'])}
						/>
						<span class={none || ready ? 'text-muted-foreground' : 'font-medium text-warning'}>
							{none ? m.workload_none() : ready ? m.workload_ready() : m.workload_degraded()}
						</span>
					</p>
				</div>
				<p
					class={cn(
						'text-xl font-semibold tracking-tight tabular-nums',
						none && 'text-muted-foreground'
					)}
				>
					<bdi>
						{m.workspace_workload_ready_ratio({
							ready: String(row.ready),
							total: String(row.total)
						})}
					</bdi>
				</p>
			</div>
		{/each}
	</Band>
</WidgetCard>
