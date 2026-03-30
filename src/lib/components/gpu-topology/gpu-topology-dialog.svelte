<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

	import { fetchModelServiceTopology, fetchNodeTopology } from './fetch-topology';
	import GpuTopologyDiagram from './gpu-topology-diagram.svelte';
	import type { TopologyData, TopologyView } from './types';

	let {
		cluster,
		namespace = '',
		view,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace?: string;
		view: TopologyView;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let topologyData = $state<TopologyData | null>(null);

	async function fetchData() {
		isLoading = true;
		error = null;
		topologyData = null;

		try {
			if (view === 'model-service') {
				topologyData = await fetchModelServiceTopology(client, cluster, namespace, name);
			} else {
				topologyData = await fetchNodeTopology(client, cluster, object);
			}
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

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="flex-nowrap p-0 text-xs" size="sm">
			<Item.Media>
				<NetworkIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>{m.gpu_allocation()}</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-[85vh] max-h-[85vh] max-w-[90vw] min-w-[70vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>
				{m.gpu_allocation_title({ name })}
			</Dialog.Title>
			<Dialog.Description>
				{#if view === 'model-service'}
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
					{#if view === 'model-service'}
						{m.gpu_allocation_empty_model()}
					{:else}
						{m.gpu_allocation_empty_node()}
					{/if}
				</div>
			{:else if topologyData}
				<GpuTopologyDiagram {topologyData} {view} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
