<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { BotIcon } from '@lucide/svelte';
	import Box from '@lucide/svelte/icons/box';
	import Layers from '@lucide/svelte/icons/layers';
	import Route from '@lucide/svelte/icons/route';
	import Server from '@lucide/svelte/icons/server';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		AppsV1ReplicaSet,
		AppsV1StatefulSet,
		AutoscalingV2HorizontalPodAutoscaler,
		CoreV1Pod,
		CoreV1Service,
		GatewayNetworkingK8SIoV1Gateway,
		GatewayNetworkingK8SIoV1HTTPRoute,
		InferenceNetworkingK8SIoV1InferencePool,
		LeaderworkersetXK8SIoV1LeaderWorkerSet,
		ServingKserveIoV1Alpha1LLMInferenceService
	} from '@otterscale/types';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';

	import DeploymentViewer from '../related-resources-viewer/deployment.svelte';
	import HttpRouteViewer from '../related-resources-viewer/http-route.svelte';
	import InferencePoolViewer from '../related-resources-viewer/inference-pool.svelte';
	import LeaderWorkerSetViewer from '../related-resources-viewer/leader-worker-set.svelte';
	import PodViewer from '../related-resources-viewer/pod.svelte';
	import ReplicaSetViewer from '../related-resources-viewer/replica-set.svelte';
	import ServiceViewer from '../related-resources-viewer/service.svelte';
	import StatefulSetViewer from '../related-resources-viewer/stateful-set.svelte';

	let { object } = $props<{ object: ServingKserveIoV1Alpha1LLMInferenceService }>();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const serviceName = $derived(object?.metadata?.name ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');

	// AbortController is used to terminate all watch streams when the component is destroyed
	const abortController = new AbortController();

	type RelatedResource =
		| AppsV1Deployment
		| LeaderworkersetXK8SIoV1LeaderWorkerSet
		| AppsV1ReplicaSet
		| AppsV1StatefulSet
		| CoreV1Service
		| CoreV1Pod
		| InferenceNetworkingK8SIoV1InferencePool
		| GatewayNetworkingK8SIoV1Gateway
		| GatewayNetworkingK8SIoV1HTTPRoute
		| AutoscalingV2HorizontalPodAutoscaler;

	async function listResources<T extends RelatedResource>(
		identifier: { group: string; version: string; resource: string },
		setResources: (items: T[]) => void,
		labelSelector?: string
	) {
		while (!abortController.signal.aborted) {
			try {
				const response = await resourceClient.list(
					{
						cluster,
						namespace,
						labelSelector:
							labelSelector ??
							`app.kubernetes.io/part-of=llminferenceservice,app.kubernetes.io/name=${serviceName}`,
						...identifier
					},
					{ signal: abortController.signal }
				);
				const items = response.items.map((item) => item.object as T);
				setResources(items);
			} catch (error) {
				if (abortController.signal.aborted) return;
				console.error(`Failed to list ${identifier.resource}:`, error);
				await sleep(3000);
				continue;
			}

			if (!abortController.signal.aborted) {
				await sleep(1000);
			}
		}
	}

	function sleep(ms: number) {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				abortController.signal.removeEventListener('abort', onAbort);
				resolve();
			}, ms);
			const onAbort = () => {
				clearTimeout(timer);
				resolve();
			};
			abortController.signal.addEventListener('abort', onAbort, { once: true });
		});
	}

	const conditions = $derived(
		[...(object?.status?.conditions ?? [])].sort(
			(previous, next) => Number(previous.status === 'True') - Number(next.status === 'True')
		)
	);
	const readyCondition = $derived(conditions.find((condition) => condition.type === 'Ready'));
	const isReady = $derived(readyCondition?.status === 'True');

	let deployments = $state<AppsV1Deployment[]>([]);
	let leaderWorkerSets = $state<LeaderworkersetXK8SIoV1LeaderWorkerSet[]>([]);
	let replicaSets = $state<AppsV1ReplicaSet[]>([]);
	let allStatefulSets = $state<AppsV1StatefulSet[]>([]);
	let services = $state<CoreV1Service[]>([]);
	let pods = $state<CoreV1Pod[]>([]);
	let inferencePools = $state<InferenceNetworkingK8SIoV1InferencePool[]>([]);
	let httpRoutes = $state<GatewayNetworkingK8SIoV1HTTPRoute[]>([]);

	// StatefulSets created by a LeaderWorkerSet only carry `leaderworkerset.sigs.k8s.io/*`
	// labels — not the `app.kubernetes.io/*` labels the shared selector relies on — so they
	// are matched client-side via their ownerReference to a LeaderWorkerSet of this service.
	const statefulSets = $derived.by(() => {
		const leaderWorkerSetUids = new Set(
			leaderWorkerSets.map((leaderWorkerSet) => leaderWorkerSet.metadata?.uid).filter(Boolean)
		);
		return allStatefulSets.filter((statefulSet) =>
			statefulSet.metadata?.ownerReferences?.some(
				(ownerReference) =>
					ownerReference.kind === 'LeaderWorkerSet' && leaderWorkerSetUids.has(ownerReference.uid)
			)
		);
	});

	onMount(() => {
		if (!serviceName) return;

		listResources<AppsV1Deployment>(
			{ group: 'apps', version: 'v1', resource: 'deployments' },
			(items) => (deployments = items)
		);
		listResources<LeaderworkersetXK8SIoV1LeaderWorkerSet>(
			{ group: 'leaderworkerset.x-k8s.io', version: 'v1', resource: 'leaderworkersets' },
			(items) => (leaderWorkerSets = items)
		);
		listResources<AppsV1ReplicaSet>(
			{ group: 'apps', version: 'v1', resource: 'replicasets' },
			(items) => (replicaSets = items)
		);
		listResources<AppsV1StatefulSet>(
			{ group: 'apps', version: 'v1', resource: 'statefulsets' },
			(items) => (allStatefulSets = items),
			'' // no label selector — matched client-side via ownerReference, see `statefulSets`
		);
		listResources<CoreV1Service>(
			{ group: '', version: 'v1', resource: 'services' },
			(items) => (services = items)
		);
		listResources<CoreV1Pod>(
			{ group: '', version: 'v1', resource: 'pods' },
			(items) => (pods = items)
		);
		listResources<InferenceNetworkingK8SIoV1InferencePool>(
			{ group: 'inference.networking.k8s.io', version: 'v1', resource: 'inferencepools' },
			(items) => (inferencePools = items)
		);
		listResources<GatewayNetworkingK8SIoV1HTTPRoute>(
			{ group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
			(items) => (httpRoutes = items)
		);
	});

	onDestroy(() => {
		abortController.abort();
	});
</script>

<Field.Group>
	<Field.Set>
		<Card.Root class="flex h-full flex-col border-0 bg-muted/30 shadow-none ring-0">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<BotIcon />
						</Item.Media>
						<Item.Content>
							<Item.Title>
								{object?.spec?.model?.name}
							</Item.Title>
							<Item.Description>{object?.spec?.model?.uri}</Item.Description>
						</Item.Content>
						<Item.Actions>
							{#if isReady}
								<Badge>{readyCondition?.reason ?? 'Ready'}</Badge>
							{:else}
								<Badge variant="destructive">{readyCondition?.reason ?? 'Not Ready'}</Badge>
							{/if}
						</Item.Actions>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#if conditions.length > 0}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
						{#each conditions as condition, index (index)}
							{#if condition.status === 'True'}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="flex items-center gap-2 text-sm font-medium">
											{condition.type}
										</Item.Title>
										<Item.Description class="text-xs">
											{condition.lastTransitionTime}
										</Item.Description>
									</Item.Content>
									<Item.Actions>
										<Badge>{condition.type}</Badge>
									</Item.Actions>
								</Item.Root>
							{:else}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="flex items-center gap-2 text-sm font-medium">
											{condition.reason}
										</Item.Title>
										<Item.Description class="text-xs">{condition.message}</Item.Description>
									</Item.Content>
									<Item.Actions>
										<Badge variant="destructive">{condition.type}</Badge>
									</Item.Actions>
								</Item.Root>
							{/if}
						{/each}
					</div>
				{:else}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Description>There are no status conditions to display.</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related Deployments</Item.Title>
				<Item.Description>
					{deployments.length} deployments related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if deployments.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each deployments as deployment (deployment.metadata?.uid)}
					<DeploymentViewer {deployment} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No Deployments Found</Empty.Title>
					<Empty.Description>
						No deployments owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related LeaderWorkerSets</Item.Title>
				<Item.Description>
					{leaderWorkerSets.length} LeaderWorkerSets related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if leaderWorkerSets.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each leaderWorkerSets as leaderWorkerSet (leaderWorkerSet.metadata?.uid)}
					<LeaderWorkerSetViewer {leaderWorkerSet} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No LeaderWorkerSets Found</Empty.Title>
					<Empty.Description>
						No LeaderWorkerSets owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related ReplicaSets</Item.Title>
				<Item.Description>
					{replicaSets.length} ReplicaSets related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if replicaSets.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each replicaSets as replicaSet (replicaSet.metadata?.uid)}
					<ReplicaSetViewer {replicaSet} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No ReplicaSets Found</Empty.Title>
					<Empty.Description>
						No ReplicaSets owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related StatefulSets</Item.Title>
				<Item.Description>
					{statefulSets.length} StatefulSets related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if statefulSets.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each statefulSets as statefulSet (statefulSet.metadata?.uid)}
					<StatefulSetViewer {statefulSet} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No StatefulSets Found</Empty.Title>
					<Empty.Description>
						No StatefulSets owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related Pods</Item.Title>
				<Item.Description>
					{pods.length} pods related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if pods.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each pods as pod (pod.metadata?.uid)}
					<PodViewer {pod} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Box />
					</Empty.Media>
					<Empty.Title>No Pods Found</Empty.Title>
					<Empty.Description>
						No pods owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related InferencePools</Item.Title>
				<Item.Description>
					{inferencePools.length} InferencePools related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if inferencePools.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each inferencePools as inferencePool (inferencePool.metadata?.uid)}
					<InferencePoolViewer {inferencePool} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Route />
					</Empty.Media>
					<Empty.Title>No InferencePools Found</Empty.Title>
					<Empty.Description>
						No InferencePools owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related Services</Item.Title>
				<Item.Description>
					{services.length} services related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if services.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each services as service (service.metadata?.uid)}
					<ServiceViewer {service} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Server />
					</Empty.Media>
					<Empty.Title>No Services Found</Empty.Title>
					<Empty.Description>
						No services owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>HTTP Routes</Item.Title>
				<Item.Description>
					{httpRoutes.length} HTTP Routes related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if httpRoutes.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each httpRoutes as httpRoute (httpRoute.metadata?.uid)}
					<HttpRouteViewer {httpRoute} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Route />
					</Empty.Media>
					<Empty.Title>No HTTP Routes Found</Empty.Title>
					<Empty.Description>
						No HTTPRoutes owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
