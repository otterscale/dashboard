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
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { type Tone, toneFill } from '$lib/components/dashboard/shared/tone';
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

<WidgetCard
	title={m.workspace_workload_health_title()}
	description={m.workspace_workload_health_description()}
	state={!namespace ? 'message' : !isLoaded ? 'loading' : 'ready'}
	message={m.workspace_namespace_unresolved()}
>
	<ul class="flex flex-col divide-y">
		{#each rows as row (row.label)}
			{@const pct = row.total > 0 ? Math.min(100, Math.round((100 * row.ready) / row.total)) : 0}
			{@const tone: Tone = row.total === 0 ? 'muted' : row.ready >= row.total ? 'success' : 'warning'}
			<li class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
				<div class="flex items-center justify-between gap-2">
					<span class="flex min-w-0 items-center gap-2 text-sm font-medium">
						<Status size="sm" class={cn('ring-0', toneFill[tone])} />
						<span class="truncate">{row.label}</span>
					</span>
					<span
						class="shrink-0 text-sm tabular-nums {row.total === 0 ? 'text-muted-foreground' : ''}"
					>
						{m.workspace_workload_ready_ratio({
							ready: String(row.ready),
							total: String(row.total)
						})}
					</span>
				</div>
				<Meter value={pct} label={row.label} {tone} />
			</li>
		{/each}
	</ul>
</WidgetCard>
