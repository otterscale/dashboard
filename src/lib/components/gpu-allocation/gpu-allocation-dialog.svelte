<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, type Snippet } from 'svelte';

	import { page } from '$app/state';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/messages';
	import { sharedMetrics } from '$lib/prometheus';

	import { fetchLLMInferenceServiceTopology, fetchNodeTopology } from './fetch-topology';
	import { fetchGpuAllocatedTotals, fetchGpuUtilization } from './fetch-utilization';
	import GpuAllocationDiagram from './gpu-allocation-diagram.svelte';
	import type { GpuAllocatedTotal, TopologyData, TopologyView } from './types';

	let {
		cluster,
		namespace = '',
		view,
		object,
		onOpenChangeComplete,
		trigger
	}: {
		cluster: string;
		namespace?: string;
		view: TopologyView;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
		/** Replaces the default menu-row trigger; callers outside a menu supply their own. */
		trigger?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');

	/**
	 * A model's view is open to everyone. Only a cluster admin, who may list pods
	 * in every namespace, counts each card from the pods on its node; everyone else
	 * gets per-card totals from the shared scope, which count other tenants'
	 * bookings without naming them. A cluster metrics viewer may still be refused
	 * the pod listing, so that permission alone is not enough. The node view lists
	 * every pod on a node, so it stays with cluster metrics viewers.
	 */
	const isClusterAdmin = $derived(page.data.isClusterAdmin === true);
	const canViewClusterMetrics = $derived(page.data.canViewClusterMetrics === true);
	const available = $derived(view === 'llm-inference-service' || canViewClusterMetrics);
	const shared = $derived(sharedMetrics(cluster, namespace));

	let open = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let topologyData = $state<TopologyData | null>(null);

	/** Bumped per open so a slow metrics response can't land on a later topology. */
	let requestId = 0;

	/**
	 * Attach measured per-card usage, and for viewers other than a cluster admin
	 * the scheduler's per-card totals, to the topology already on screen. Runs after
	 * the diagram renders rather than as part of `fetchData`, so a failing query
	 * only costs these numbers — never the allocation view itself.
	 */
	async function attachMetrics(data: TopologyData, id: number) {
		if (data.gpus.length === 0) return;

		try {
			const [utilization, totals] = await Promise.all([
				fetchGpuUtilization(
					shared,
					data.gpus.map((gpu) => gpu.device.id)
				),
				isClusterAdmin
					? Promise.resolve(new Map<string, GpuAllocatedTotal>())
					: fetchGpuAllocatedTotals(shared)
			]);
			if (id !== requestId || (utilization.size === 0 && totals.size === 0)) return;

			topologyData = {
				...data,
				gpus: data.gpus.map((gpu) => ({
					...gpu,
					utilization: utilization.get(gpu.device.id),
					allocatedTotal: totals.get(gpu.device.id)
				}))
			};
		} catch (err) {
			console.warn('Failed to fetch GPU metrics:', err);
		}
	}

	async function fetchData() {
		if (!available) return;
		const id = ++requestId;
		isLoading = true;
		error = null;
		topologyData = null;

		try {
			const data =
				view === 'llm-inference-service'
					? await fetchLLMInferenceServiceTopology(client, cluster, namespace, name, isClusterAdmin)
					: await fetchNodeTopology(client, cluster, object);
			if (id !== requestId) return;
			topologyData = data;
			void attachMetrics(data, id);
		} catch (err) {
			console.error('Failed to fetch GPU allocation:', err);
			error = m.gpu_allocation_fetch_error({ message: (err as ConnectError).message });
		} finally {
			isLoading = false;
		}
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			fetchData();
		}
	}

	const isEmpty = $derived(
		topologyData && topologyData.gpus.length === 0 && topologyData.pods.length === 0
	);
</script>

{#if available}
	<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
		<Dialog.Trigger class={trigger ? undefined : 'w-full'}>
			{#if trigger}
				{@render trigger()}
			{:else}
				<Item.Root class="flex-nowrap p-0 text-xs" size="sm">
					<Item.Media>
						<GpuIcon />
					</Item.Media>
					<Item.Content>
						<Item.Title>{m.gpu_allocation()}</Item.Title>
					</Item.Content>
				</Item.Root>
			{/if}
		</Dialog.Trigger>
		<Dialog.Content class="flex h-[85vh] max-h-[85vh] max-w-[90vw] min-w-[70vw] flex-col gap-3">
			<Dialog.Header>
				<Dialog.Title>
					{m.gpu_allocation_title({ name })}
				</Dialog.Title>
				<Dialog.Description>
					{#if view === 'llm-inference-service'}
						{m.gpu_allocation_model_description()}
					{:else}
						{m.gpu_allocation_node_description()}
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex-1 overflow-hidden">
				{#if isLoading}
					<div
						class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
					>
						{m.gpu_allocation_loading()}
					</div>
				{:else if error}
					<div
						class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-destructive"
					>
						{error}
					</div>
				{:else if isEmpty}
					<div
						class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
					>
						{#if view === 'llm-inference-service'}
							{m.gpu_allocation_empty_model()}
						{:else}
							{m.gpu_allocation_empty_node()}
						{/if}
					</div>
				{:else if topologyData}
					<GpuAllocationDiagram {topologyData} {view} />
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
