<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import {
		type ListRequest,
		type ListResponse,
		type Resource,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import { m } from '$lib/paraglide/messages';

	type WorkloadListSpec = {
		group: string;
		version: string;
		resource: string;
	};

	/** Same GVR as console nav / model.svelte (ResourceService.list). */
	const WORKLOAD_SPECS: WorkloadListSpec[] = [
		{ group: 'model.otterscale.io', version: 'v1alpha1', resource: 'modelservices' },
		{ group: 'workload.otterscale.io', version: 'v1alpha1', resource: 'applications' },
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

	// widget-grid passes prometheusDriver to every tile; this widget uses Resource API only.
	void prometheusDriver;

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
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="group relative h-full min-h-[280px] gap-2 overflow-hidden">
	<HeartPulse
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header>
		<Card.Title>{m.workspace_workload_health_title()}</Card.Title>
		<Card.Description class="text-md flex min-h-6 items-center">
			{m.workspace_workload_health_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground"
			>{m.workspace_namespace_unresolved()}</Card.Content
		>
	{:else if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<LoaderCircle class="size-10 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<Card.Content class="space-y-2.5">
			{#each rows as row (row.label)}
				{@const pct = row.total > 0 ? Math.min(100, Math.round((100 * row.ready) / row.total)) : 0}
				<div class="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm font-medium">{row.label}</span>
						<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
							{m.workspace_workload_ready_ratio({
								ready: String(row.ready),
								total: String(row.total)
							})}
						</span>
					</div>
					<Progress value={pct} max={100} class="h-1.5 bg-muted/80" />
				</div>
			{/each}
		</Card.Content>
	{/if}
</Card.Root>
