<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { m } from '$lib/paraglide/messages';

	import NamespaceCommitment from './namespace/namespace-commitment.svelte';
	import NamespaceRanking from './namespace/namespace-ranking.svelte';
	import PodResourceTable from './namespace/pod-resource-table.svelte';
	import PvcStorage from './namespace/pvc-storage.svelte';
	import WorkloadSummary from './namespace/workload-summary.svelte';
	import NodeDetail from './node/node-detail.svelte';
	import NodePressure from './node/node-pressure.svelte';
	import NodeRanking from './node/node-ranking.svelte';
	import PlaceholderCard from './placeholder-card.svelte';

	let {
		client,
		view,
		selectedNode = $bindable(),
		selectedNamespace = $bindable(),
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		// `node` shows Sections A+B (per-node), `namespace` shows Section C (per-namespace).
		view: 'node' | 'namespace';
		// node_exporter `instance` of the selected node (drives Section B)
		selectedNode: string | undefined;
		selectedNamespace: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const reloading = $derived(isReloading ?? false);
	// `.*` is the "all" sentinel selected by default in the pickers; treat it as "nothing
	// drilled in" so Section B shows its placeholder until a concrete node / namespace is picked.
	const hasNodeSelected = $derived(!!selectedNode && selectedNode !== '.*');
	const hasNamespaceSelected = $derived(!!selectedNamespace && selectedNamespace !== '.*');

	// Section-A bars are labelled by the Kubernetes node name, while Section B's node_exporter
	// charts filter on the `instance` label. Resolve node name → instance so clicking a ranking
	// bar drills into the matching node detail.
	let nodeToInstance = $state<Record<string, string>>({});
	// Reverse of the above: node_exporter `instance` → Kubernetes node name. cAdvisor /
	// kube-state-metrics charts filter on the `node` label (the k8s name), so the
	// commitment + pods cards resolve the selected instance back to its node name.
	let instanceToNode = $state<Record<string, string>>({});
	onMount(async () => {
		try {
			const response = await client.instantQuery('node_uname_info');
			const series = (response.result ?? []) as { metric: { labels: Record<string, string> } }[];
			const map: Record<string, string> = {};
			const reverse: Record<string, string> = {};
			for (const s of series) {
				const labels = s.metric?.labels ?? {};
				if (labels.nodename && labels.instance) {
					map[labels.nodename] = labels.instance;
					reverse[labels.instance] = labels.nodename;
				}
			}
			nodeToInstance = map;
			instanceToNode = reverse;
		} catch {
			nodeToInstance = {};
			instanceToNode = {};
		}
	});

	// `selectedNode` holds the node_exporter instance; resolve it to the k8s node name
	// (falling back to the value itself when the uname mapping is unavailable).
	const selectedNodeName = $derived(
		selectedNode ? (instanceToNode[selectedNode] ?? selectedNode) : undefined
	);

	function handleNodeClick(node: string) {
		selectedNode = nodeToInstance[node] ?? node;
	}
	function handleNamespaceClick(namespace: string) {
		selectedNamespace = namespace;
	}
</script>

<div class="flex flex-col gap-6 pt-4">
	{#if view === 'node'}
		<!-- Section A: per-node ranking (cluster-wide, click to drill in) -->
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_node_ranking()}</h2>
			<div class="grid w-full items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<NodePressure
					prometheusDriver={client}
					resource="cpu"
					title={m.node_cpu_pressure()}
					description={m.node_cpu_pressure_description()}
					tooltip={m.node_cpu_pressure_tooltip()}
					onNodeClick={handleNodeClick}
					isReloading={reloading}
				/>
				<NodePressure
					prometheusDriver={client}
					resource="memory"
					title={m.node_memory_pressure()}
					description={m.node_memory_pressure_description()}
					tooltip={m.node_memory_pressure_tooltip()}
					onNodeClick={handleNodeClick}
					isReloading={reloading}
				/>
				<NodeRanking
					prometheusDriver={client}
					kind="gpu"
					title={m.gpu_utilization()}
					description={m.node_gpu_utilization_description()}
					tooltip={m.node_gpu_utilization_tooltip()}
					onNodeClick={handleNodeClick}
					isReloading={reloading}
				/>
				<NodeRanking
					prometheusDriver={client}
					kind="restart"
					title={m.node_restart_count()}
					description={m.node_restart_count_description()}
					tooltip={m.node_restart_count_tooltip()}
					onNodeClick={handleNodeClick}
					isReloading={reloading}
				/>
			</div>
		</section>

		<!-- Section B: selected-node system detail (node_exporter time series) -->
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_node_detail()}</h2>
			{#if hasNodeSelected}
				<NodeDetail
					{client}
					fqdn={selectedNode ?? ''}
					nodeName={selectedNodeName}
					{start}
					{end}
					{endIsNow}
					isReloading={reloading}
				/>
			{:else}
				<PlaceholderCard
					title={m.section_node_detail()}
					message={m.select_node_to_view_details()}
				/>
			{/if}
		</section>
	{:else}
		<!-- Section A: namespace ranking (cluster-wide, click to select a namespace) -->
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_namespace_ranking()}</h2>
			<div class="grid w-full items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<NamespaceRanking
					prometheusDriver={client}
					kind="cpu"
					title={m.namespace_cpu_usage()}
					description={m.namespace_cpu_usage_description()}
					tooltip={m.namespace_cpu_usage_tooltip()}
					onNamespaceClick={handleNamespaceClick}
					isReloading={reloading}
				/>
				<NamespaceRanking
					prometheusDriver={client}
					kind="memory"
					title={m.namespace_memory_usage()}
					description={m.namespace_memory_usage_description()}
					tooltip={m.namespace_memory_usage_tooltip()}
					onNamespaceClick={handleNamespaceClick}
					isReloading={reloading}
				/>
				<NamespaceRanking
					prometheusDriver={client}
					kind="pods"
					title={m.namespace_pod_count()}
					description={m.namespace_pod_count_description()}
					tooltip={m.namespace_pod_count_tooltip()}
					onNamespaceClick={handleNamespaceClick}
					isReloading={reloading}
				/>
				<NamespaceRanking
					prometheusDriver={client}
					kind="restart"
					title={m.namespace_restart_count()}
					description={m.namespace_restart_count_description()}
					tooltip={m.namespace_restart_count_tooltip()}
					onNamespaceClick={handleNamespaceClick}
					isReloading={reloading}
				/>
			</div>
		</section>

		<!-- Section B: selected-namespace detail (summary + commitment + pvc + pod table) -->
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold">{m.section_namespace_detail()}</h2>
			{#if hasNamespaceSelected}
				{#key selectedNamespace}
					<WorkloadSummary {client} namespace={selectedNamespace} isReloading={reloading} />
					<NamespaceCommitment
						{client}
						namespace={selectedNamespace}
						{start}
						{end}
						{endIsNow}
						isReloading={reloading}
					/>
					<PodResourceTable {client} namespace={selectedNamespace} isReloading={reloading} />
					<PvcStorage
						prometheusDriver={client}
						namespace={selectedNamespace}
						isReloading={reloading}
					/>
				{/key}
			{:else}
				<PlaceholderCard
					title={m.section_namespace_detail()}
					message={m.select_namespace_to_view_details()}
				/>
			{/if}
		</section>
	{/if}
</div>
