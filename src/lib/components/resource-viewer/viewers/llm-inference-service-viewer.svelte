<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { BotIcon } from '@lucide/svelte';
	import Box from '@lucide/svelte/icons/box';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import Layers from '@lucide/svelte/icons/layers';
	import Route from '@lucide/svelte/icons/route';
	import Server from '@lucide/svelte/icons/server';
	import { ResourceService, WatchEvent_Type } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		AppsV1ReplicaSet,
		AppsV1StatefulSet,
		AutoscalingV2HorizontalPodAutoscaler,
		CoreV1Pod,
		CoreV1Service,
		GatewayNetworkingK8SIoV1Gateway,
		GatewayNetworkingK8SIoV1HTTPRoute,
		InferenceNetworkingK8SIoV1InferencePool
	} from '@otterscale/types';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	import DeploymentViewer from '../related-resources-viewer/deployment.svelte';
	import PodViewer from '../related-resources-viewer/pod.svelte';
	import ServiceViewer from '../related-resources-viewer/service.svelte';

	let { object } = $props<{ object: any }>();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const serviceName = $derived(object?.metadata?.name ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');

	// AbortController is used to terminate all watch streams when the component is destroyed
	const abortController = new AbortController();

	const getKey = (resource: any) => resource?.metadata?.uid ?? resource?.metadata?.name ?? '';

	async function listAndWatch<T>(
		identifier: { group: string; version: string; resource: string },
		setResources: (items: T[]) => void,
		updateResources: (updater: (previous: T[]) => T[]) => void
	) {
		const labelSelector = `app.kubernetes.io/part-of=llminferenceservice,app.kubernetes.io/name=${serviceName}`;

		while (!abortController.signal.aborted) {
			let resourceVersion = '';

			try {
				const response = await resourceClient.list(
					{
						cluster,
						namespace,
						labelSelector,
						...identifier
					},
					{ signal: abortController.signal }
				);
				const items = response.items.map((item) => item.object as T);
				setResources(items);
				resourceVersion = response.resourceVersion;
			} catch (error) {
				if (abortController.signal.aborted) return;
				console.error(`Failed to list ${identifier.resource}:`, error);
				await sleep(3000);
				continue;
			}

			try {
				const stream = resourceClient.watch(
					{
						cluster,
						namespace,
						labelSelector,
						...identifier,
						resourceVersion
					},
					{ signal: abortController.signal }
				);

				for await (const event of stream) {
					if (event.type === WatchEvent_Type.BOOKMARK) {
						if (event.resourceVersion) resourceVersion = event.resourceVersion;
						continue;
					}

					if (event.type === WatchEvent_Type.ERROR) {
						console.warn(`Watch error for ${identifier.resource}, relisting...`);
						break;
					}

					const resourceObject = event.resource?.object as T | undefined;
					if (!resourceObject) continue;
					const key = getKey(resourceObject);
					if (!key) continue;

					if (event.resourceVersion) resourceVersion = event.resourceVersion;

					switch (event.type) {
						case WatchEvent_Type.ADDED:
						case WatchEvent_Type.MODIFIED: {
							updateResources((previous) => {
								const index = previous.findIndex((resource) => getKey(resource) === key);
								if (index >= 0) {
									const next = previous.slice();
									next[index] = resourceObject;
									return next;
								}
								return [...previous, resourceObject];
							});
							break;
						}
						case WatchEvent_Type.DELETED: {
							updateResources((previous) =>
								previous.filter((resource) => getKey(resource) !== key)
							);
							break;
						}
					}
				}
			} catch (error) {
				if (abortController.signal.aborted) return;
				console.error(`Watch stream error for ${identifier.resource}:`, error);
			}

			if (!abortController.signal.aborted) {
				await sleep(1000);
			}
		}
	}

	function sleep(ms: number) {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, ms);
			abortController.signal.addEventListener('abort', () => {
				clearTimeout(timer);
				resolve();
			});
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
	let leaderWorkerSets = $state<any[]>([]);
	let replicaSets = $state<AppsV1ReplicaSet[]>([]);
	let statefulSets = $state<AppsV1StatefulSet[]>([]);
	let services = $state<CoreV1Service[]>([]);
	let pods = $state<CoreV1Pod[]>([]);
	let inferencePools = $state<InferenceNetworkingK8SIoV1InferencePool[]>([]);
	let gateways = $state<GatewayNetworkingK8SIoV1Gateway[]>([]);
	let httpRoutes = $state<GatewayNetworkingK8SIoV1HTTPRoute[]>([]);
	let horizontalPodAutoscalers = $state<AutoscalingV2HorizontalPodAutoscaler[]>([]);

	onMount(() => {
		if (!serviceName) return;

		listAndWatch<AppsV1Deployment>(
			{ group: 'apps', version: 'v1', resource: 'deployments' },
			(items) => (deployments = items),
			(updater) => (deployments = updater(deployments))
		);
		listAndWatch<any>(
			{ group: 'leaderworkerset.x-k8s.io', version: 'v1', resource: 'leaderworkersets' },
			(items) => (leaderWorkerSets = items),
			(updater) => (leaderWorkerSets = updater(leaderWorkerSets))
		);
		listAndWatch<AppsV1ReplicaSet>(
			{ group: 'apps', version: 'v1', resource: 'replicasets' },
			(items) => (replicaSets = items),
			(updater) => (replicaSets = updater(replicaSets))
		);
		listAndWatch<AppsV1StatefulSet>(
			{ group: 'apps', version: 'v1', resource: 'statefulsets' },
			(items) => (statefulSets = items),
			(updater) => (statefulSets = updater(statefulSets))
		);
		listAndWatch<CoreV1Service>(
			{ group: '', version: 'v1', resource: 'services' },
			(items) => (services = items),
			(updater) => (services = updater(services))
		);
		listAndWatch<CoreV1Pod>(
			{ group: '', version: 'v1', resource: 'pods' },
			(items) => (pods = items),
			(updater) => (pods = updater(pods))
		);
		listAndWatch<InferenceNetworkingK8SIoV1InferencePool>(
			{ group: 'inference.networking.k8s.io', version: 'v1', resource: 'inferencepools' },
			(items) => (inferencePools = items),
			(updater) => (inferencePools = updater(inferencePools))
		);
		listAndWatch<GatewayNetworkingK8SIoV1Gateway>(
			{ group: 'gateway.networking.k8s.io', version: 'v1', resource: 'gateways' },
			(items) => (gateways = items),
			(updater) => (gateways = updater(gateways))
		);
		listAndWatch<GatewayNetworkingK8SIoV1HTTPRoute>(
			{ group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
			(items) => (httpRoutes = items),
			(updater) => (httpRoutes = updater(httpRoutes))
		);
		listAndWatch<AutoscalingV2HorizontalPodAutoscaler>(
			{ group: 'autoscaling', version: 'v2', resource: 'horizontalpodautoscalers' },
			(items) => (horizontalPodAutoscalers = items),
			(updater) => (horizontalPodAutoscalers = updater(horizontalPodAutoscalers))
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
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{leaderWorkerSet?.metadata?.name}</Card.Title>
							<Card.Description>
								<Badge>
									{leaderWorkerSet?.status?.readyReplicas ?? 0}/{leaderWorkerSet?.status
										?.replicas ??
										leaderWorkerSet?.spec?.replicas ??
										0} ready
								</Badge>
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={leaderWorkerSet?.metadata?.namespace ?? namespace}
									group="leaderworkerset.x-k8s.io"
									version="v1"
									resource="leaderworkersets"
									object={leaderWorkerSet}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
					</Card.Root>
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
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{replicaSet?.metadata?.name}</Card.Title>
							<Card.Description>
								<Badge>
									{replicaSet?.status?.readyReplicas ?? 0}/{replicaSet?.status?.replicas ??
										replicaSet?.spec?.replicas ??
										0} ready
								</Badge>
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={replicaSet?.metadata?.namespace ?? namespace}
									group="apps"
									version="v1"
									resource="replicasets"
									object={replicaSet}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
					</Card.Root>
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
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{statefulSet?.metadata?.name}</Card.Title>
							<Card.Description>
								<Badge>
									{statefulSet?.status?.readyReplicas ?? 0}/{statefulSet?.status?.replicas ??
										statefulSet?.spec?.replicas ??
										0} ready
								</Badge>
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={statefulSet?.metadata?.namespace ?? namespace}
									group="apps"
									version="v1"
									resource="statefulsets"
									object={statefulSet}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
					</Card.Root>
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
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{inferencePool?.metadata?.name}</Card.Title>
							<Card.Description>
								{@const accepted = inferencePool?.status?.parents
									?.flatMap((parent) => parent.conditions ?? [])
									.find((condition) => condition.type === 'Accepted')}
								{#if accepted?.status === 'True'}
									<Badge>Accepted</Badge>
								{:else}
									<Badge variant="destructive">{accepted?.reason ?? 'Pending'}</Badge>
								{/if}
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={inferencePool?.metadata?.namespace ?? namespace}
									group="inference.networking.k8s.io"
									version="v1"
									resource="inferencepools"
									object={inferencePool}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{@const targetPorts = inferencePool?.spec?.targetPorts ?? []}
							{#if targetPorts.length > 0}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Target Ports</Item.Title>
										<Item.Description class="flex flex-wrap gap-1">
											{#each targetPorts as targetPort, index (index)}
												<Badge variant="outline" class="font-mono">{targetPort.number}</Badge>
											{/each}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
							{@const parents = inferencePool?.status?.parents ?? []}
							{#if parents.length > 0}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Parents</Item.Title>
										<Item.Description class="flex flex-wrap gap-1">
											{#each parents as parent, index (index)}
												<Badge variant="outline">{parent.parentRef.name}</Badge>
											{/each}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
						</Card.Content>
					</Card.Root>
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
				<Item.Title>Related Gateways</Item.Title>
				<Item.Description>
					{gateways.length} Gateways related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if gateways.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each gateways as gateway (gateway.metadata?.uid)}
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{gateway?.metadata?.name}</Card.Title>
							<Card.Description>
								<Badge>{gateway?.spec?.gatewayClassName ?? 'Gateway'}</Badge>
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={gateway?.metadata?.namespace ?? namespace}
									group="gateway.networking.k8s.io"
									version="v1"
									resource="gateways"
									object={gateway}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{@const listeners = gateway?.spec?.listeners ?? []}
							{#if listeners.length > 0}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Listeners</Item.Title>
										<Item.Description class="flex flex-wrap gap-1">
											{#each listeners as listener, index (index)}
												<Badge variant="outline">
													{listener.name ?? `listener-${index + 1}`}
												</Badge>
											{/each}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Route />
					</Empty.Media>
					<Empty.Title>No Gateways Found</Empty.Title>
					<Empty.Description>
						No Gateways owned by this LLMInferenceService were found.
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
					<Card.Root>
						<Card.Header>
							<Card.Title>{httpRoute?.metadata?.name}</Card.Title>
							<Card.Description>
								{@const accepted = httpRoute?.status?.parents?.[0]?.conditions?.find(
									(condition) => condition.type === 'Accepted'
								)}
								{#if accepted?.status === 'True'}
									<Badge>Accepted</Badge>
								{:else}
									<Badge variant="destructive">{accepted?.reason ?? 'Not Accepted'}</Badge>
								{/if}
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={httpRoute?.metadata?.namespace ?? namespace}
									group="gateway.networking.k8s.io"
									version="v1"
									resource="httproutes"
									object={httpRoute}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{@const hostnames = httpRoute?.spec?.hostnames ?? []}
							{#if hostnames.length > 0}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Hostnames</Item.Title>
										<Item.Description class="flex flex-wrap gap-1">
											{#each hostnames as hostname (hostname)}
												<Badge variant="outline" class="font-mono">{hostname}</Badge>
											{/each}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
							{@const parentRefs = httpRoute?.spec?.parentRefs ?? []}
							{#if parentRefs.length > 0}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Gateways</Item.Title>
										<Item.Description class="flex flex-wrap gap-1">
											{#each parentRefs as parentRef, index (index)}
												<Badge variant="outline">{parentRef.name}</Badge>
											{/each}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
						</Card.Content>
					</Card.Root>
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

	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related HorizontalPodAutoscalers</Item.Title>
				<Item.Description>
					{horizontalPodAutoscalers.length} HPAs related to {object.kind}
					{object.metadata?.name}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if horizontalPodAutoscalers.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each horizontalPodAutoscalers as horizontalPodAutoscaler (horizontalPodAutoscaler.metadata?.uid)}
					<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
						<Card.Header>
							<Card.Title>{horizontalPodAutoscaler?.metadata?.name}</Card.Title>
							<Card.Description>
								{@const condition =
									horizontalPodAutoscaler?.status?.conditions?.find(
										(condition) => condition.status === 'True'
									) ?? horizontalPodAutoscaler?.status?.conditions?.[0]}
								{#if condition?.status === 'True'}
									<Badge>{condition?.type ?? 'Active'}</Badge>
								{:else}
									<Badge variant="destructive">{condition?.reason ?? 'Pending'}</Badge>
								{/if}
							</Card.Description>
							<Card.Action>
								<Describe
									{cluster}
									namespace={horizontalPodAutoscaler?.metadata?.namespace ?? namespace}
									group="autoscaling"
									version="v2"
									resource="horizontalpodautoscalers"
									object={horizontalPodAutoscaler}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
											<FileSearchIcon size={16} />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
							</Card.Action>
						</Card.Header>
						<Card.Content class="flex flex-col gap-2">
							{#if horizontalPodAutoscaler?.spec?.scaleTargetRef}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class="text-xs">Scale Target</Item.Title>
										<Item.Description>
											{horizontalPodAutoscaler.spec.scaleTargetRef.kind}/
											{horizontalPodAutoscaler.spec.scaleTargetRef.name}
										</Item.Description>
									</Item.Content>
								</Item.Root>
							{/if}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title class="text-xs">Replicas</Item.Title>
									<Item.Description>
										{horizontalPodAutoscaler?.status?.currentReplicas ?? 0} current /
										{horizontalPodAutoscaler?.status?.desiredReplicas ?? 0} desired
									</Item.Description>
								</Item.Content>
							</Item.Root>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full bg-muted/30">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No HPAs Found</Empty.Title>
					<Empty.Description>
						No HorizontalPodAutoscalers owned by this LLMInferenceService were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
