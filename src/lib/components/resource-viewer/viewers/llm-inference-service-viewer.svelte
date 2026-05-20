<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import Layers from '@lucide/svelte/icons/layers';
	import Network from '@lucide/svelte/icons/network';
	import Route from '@lucide/svelte/icons/route';
	import Server from '@lucide/svelte/icons/server';
	import { ResourceService, WatchEvent_Type } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		CoreV1Pod,
		CoreV1Service,
		GatewayNetworkingK8SIoV1HTTPRoute,
		ServingKserveIoV1Alpha2LLMInferenceService
	} from '@otterscale/types';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import { cn } from '$lib/utils';

	import DeploymentViewer from '../related-resources-viewer/deployment.svelte';
	import PodViewer from '../related-resources-viewer/pod.svelte';
	import ServiceViewer from '../related-resources-viewer/service.svelte';

	let { object }: { object: ServingKserveIoV1Alpha2LLMInferenceService } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const serviceName = $derived(object?.metadata?.name ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');

	// KServe labels every child resource of an LLMInferenceService with these.
	// See kserve pkg/constants: KubernetesAppNameLabelKey / KubernetesPartOfLabelKey / LLMDRoleLabelKey.
	const LABEL_APP_NAME = 'app.kubernetes.io/name';
	const LABEL_PART_OF = 'app.kubernetes.io/part-of';
	const LABEL_ROLE = 'llm-d.ai/role';
	const PART_OF_VALUE = 'llminferenceservice';

	type TargetResource =
		| AppsV1Deployment
		| CoreV1Pod
		| CoreV1Service
		| GatewayNetworkingK8SIoV1HTTPRoute;

	// AbortController is used to terminate all watch streams when the component is destroyed
	const abortController = new AbortController();

	const getKey = (o: TargetResource) => o?.metadata?.uid ?? o?.metadata?.name ?? '';
	const getRole = (o: TargetResource) => o?.metadata?.labels?.[LABEL_ROLE] ?? 'main';

	async function listAndWatch<T extends TargetResource>(
		identifier: { group: string; version: string; resource: string },
		setObjects: (items: T[]) => void,
		updateObject: (updater: (previous: T[]) => T[]) => void
	) {
		const labelSelector = `${LABEL_PART_OF}=${PART_OF_VALUE},${LABEL_APP_NAME}=${serviceName}`;

		while (!abortController.signal.aborted) {
			let resourceVersion = '';

			// === 1. List: Get initial snapshot ===
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
				setObjects(items);
				resourceVersion = response.resourceVersion;
			} catch (error) {
				if (abortController.signal.aborted) return;
				console.error(`Failed to list ${identifier.resource}:`, error);
				await sleep(3000);
				continue;
			}

			// === 2. Watch: Stream events starting from this resourceVersion ===
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
						// Server-side error (e.g., resourceVersion too old) -> break, re-list-then-watch
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
							updateObject((previous) => {
								const index = previous.findIndex((o) => getKey(o) === key);
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
							updateObject((previous) => previous.filter((o) => getKey(o) !== key));
							break;
						}
					}
				}
			} catch (error) {
				if (abortController.signal.aborted) return;
				console.error(`Watch stream error for ${identifier.resource}:`, error);
			}

			// Stream ended or error -> wait briefly and re-list-then-watch
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

	// L1 - The LLMInferenceService itself
	const conditions = $derived(object?.status?.conditions ?? []);
	const readyCondition = $derived(conditions.find((condition) => condition.type === 'Ready'));
	const isReady = $derived(readyCondition?.status === 'True');
	const serviceUrl = $derived(object?.status?.url ?? object?.status?.address?.url ?? '');

	// L2 - Model
	const model = $derived(object?.spec?.model);
	const loraAdapters = $derived(Object.keys(object?.spec?.model?.lora?.adapters ?? {}));

	// L2 - Router (gateway / route / scheduler references declared in the spec)
	const gatewayRefs = $derived(object?.spec?.router?.gateway?.refs ?? []);
	const httpRouteRefs = $derived(object?.spec?.router?.route?.http?.refs ?? []);
	const hasScheduler = $derived(Boolean(object?.spec?.router?.scheduler));

	// L2 - Topology summary
	const parallelism = $derived(object?.spec?.parallelism);
	const baseRefs = $derived(object?.spec?.baseRefs ?? []);
	const isDisaggregated = $derived(Boolean(object?.spec?.prefill));

	// L3 - Deployments
	let deployments = $state<AppsV1Deployment[]>([]);
	const deploymentsByRole = $derived(groupByRole(deployments));

	// L3 - Services
	let services = $state<CoreV1Service[]>([]);

	// L3 - Pods
	let pods = $state<CoreV1Pod[]>([]);
	const podsByRole = $derived(groupByRole(pods));

	// L3 - HTTPRoutes
	let httpRoutes = $state<GatewayNetworkingK8SIoV1HTTPRoute[]>([]);

	function groupByRole<T extends TargetResource>(items: T[]): [string, T[]][] {
		const groups = new Map<string, T[]>();
		for (const item of items) {
			const role = getRole(item);
			(groups.get(role) ?? groups.set(role, []).get(role)!).push(item);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	}

	onMount(() => {
		if (!serviceName) return;

		listAndWatch<AppsV1Deployment>(
			{ group: 'apps', version: 'v1', resource: 'deployments' },
			(items) => (deployments = items),
			(updater) => (deployments = updater(deployments))
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
		listAndWatch<GatewayNetworkingK8SIoV1HTTPRoute>(
			{ group: 'gateway.networking.k8s.io', version: 'v1', resource: 'httproutes' },
			(items) => (httpRoutes = items),
			(updater) => (httpRoutes = updater(httpRoutes))
		);
	});

	onDestroy(() => {
		abortController.abort();
	});
</script>

<Field.Group class="pb-8">
	<!-- L1 - LLMInferenceService -->
	<Field.Set>
		<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<BrainCircuit size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>
								{serviceName}
							</Item.Title>
							<Item.Description>llminferenceservices</Item.Description>
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
				{#if serviceUrl}
					<Card.Description>
						<a
							href={serviceUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="font-mono text-primary underline-offset-4 hover:underline"
						>
							{serviceUrl}
						</a>
					</Card.Description>
				{/if}
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#if conditions.length > 0}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
						{#each conditions as condition, index (index)}
							<Item.Root
								class={cn('p-0', condition.status === 'False' ? '**:text-destructive' : '')}
							>
								<Item.Content>
									<Item.Title class="flex items-center gap-2 text-sm font-medium">
										{condition.type}
										{#if condition.status === 'True'}
											<Badge variant="default">{condition.reason}</Badge>
										{:else}
											<Badge variant="destructive">{condition.reason}</Badge>
										{/if}
									</Item.Title>
									{#if condition.message}
										<Item.Description class="text-xs">{condition.message}</Item.Description>
									{/if}
								</Item.Content>
							</Item.Root>
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

	<!-- L2 - Model / Router / Topology -->
	<Field.Set class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
		<!-- Model -->
		<Card.Root class="flex h-full flex-col border-0">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<Box size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Model</Item.Title>
							<Item.Description>spec.model</Item.Description>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				{#if model}
					{#if model.name}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Title class="text-xs">Name</Item.Title>
								<Item.Description class="font-mono text-xs">{model.name}</Item.Description>
							</Item.Content>
						</Item.Root>
					{/if}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Title class="text-xs">URI</Item.Title>
							<Item.Description class="font-mono text-xs break-all">{model.uri}</Item.Description>
						</Item.Content>
					</Item.Root>
					{#if loraAdapters.length > 0}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Title class="text-xs">LoRA Adapters</Item.Title>
								<Item.Description class="flex flex-wrap gap-1">
									{#each loraAdapters as adapter (adapter)}
										<Badge variant="outline">{adapter}</Badge>
									{/each}
								</Item.Description>
							</Item.Content>
						</Item.Root>
					{/if}
				{:else}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Description>No model configured.</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Router -->
		<Card.Root class="flex h-full flex-col border-0">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<Route size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Router</Item.Title>
							<Item.Description>spec.router</Item.Description>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title class="text-xs">Gateways</Item.Title>
						<Item.Description class="flex flex-wrap gap-1">
							{#if gatewayRefs.length > 0}
								{#each gatewayRefs as gatewayRef, index (index)}
									<Badge variant="outline">{gatewayRef.name}</Badge>
								{/each}
							{:else}
								<span class="text-xs italic">Managed automatically</span>
							{/if}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title class="text-xs">HTTP Routes</Item.Title>
						<Item.Description class="flex flex-wrap gap-1">
							{#if httpRouteRefs.length > 0}
								{#each httpRouteRefs as httpRouteRef, index (index)}
									<Badge variant="outline">{httpRouteRef.name}</Badge>
								{/each}
							{:else}
								<span class="text-xs italic">Managed automatically</span>
							{/if}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title class="text-xs">Scheduler</Item.Title>
						<Item.Description>
							<Badge variant={hasScheduler ? 'default' : 'secondary'}>
								{hasScheduler ? 'Enabled' : 'Default'}
							</Badge>
						</Item.Description>
					</Item.Content>
				</Item.Root>
			</Card.Content>
		</Card.Root>

		<!-- Topology -->
		<Card.Root class="flex h-full flex-col border-0">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<Network size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Topology</Item.Title>
							<Item.Description>spec</Item.Description>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title class="text-xs">Mode</Item.Title>
						<Item.Description>
							<Badge variant={isDisaggregated ? 'default' : 'secondary'}>
								{isDisaggregated ? 'Prefill / Decode' : 'Single'}
							</Badge>
						</Item.Description>
					</Item.Content>
				</Item.Root>
				{#if parallelism}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Title class="text-xs">Parallelism</Item.Title>
							<Item.Description class="flex flex-wrap gap-1">
								{#if parallelism.tensor}
									<Badge variant="outline">tensor: {parallelism.tensor}</Badge>
								{/if}
								{#if parallelism.pipeline}
									<Badge variant="outline">pipeline: {parallelism.pipeline}</Badge>
								{/if}
								{#if parallelism.data}
									<Badge variant="outline">data: {parallelism.data}</Badge>
								{/if}
								{#if parallelism.expert}
									<Badge variant="outline">expert</Badge>
								{/if}
							</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
				{#if baseRefs.length > 0}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Title class="text-xs">Templates (baseRefs)</Item.Title>
							<Item.Description class="flex flex-wrap gap-1">
								{#each baseRefs as baseRef, index (index)}
									<Badge variant="outline">{baseRef.name}</Badge>
								{/each}
							</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</Field.Set>

	<!-- L3 - Deployments -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>Deployments</Label>
		{#if deployments.length > 0}
			{#each deploymentsByRole as [role, roleDeployments] (role)}
				<div class="flex items-center gap-2">
					<Badge variant="secondary">{role}</Badge>
					<span class={typographyVariants({ variant: 'muted' })}>
						{roleDeployments.length} deployment{roleDeployments.length > 1 ? 's' : ''}
					</span>
				</div>
				<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
					{#each roleDeployments as deployment (deployment.metadata?.uid)}
						<DeploymentViewer {deployment} {cluster} {namespace} />
					{/each}
				</div>
			{/each}
		{:else}
			<Empty.Root class="h-full">
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

	<!-- L3 - Pods -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>Pods</Label>
		{#if pods.length > 0}
			{#each podsByRole as [role, rolePods] (role)}
				<div class="flex items-center gap-2">
					<Badge variant="secondary">{role}</Badge>
					<span class={typographyVariants({ variant: 'muted' })}>
						{rolePods.length} pod{rolePods.length > 1 ? 's' : ''}
					</span>
				</div>
				<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
					{#each rolePods as pod (pod.metadata?.uid)}
						<PodViewer {pod} {cluster} {namespace} />
					{/each}
				</div>
			{/each}
		{:else}
			<Empty.Root class="h-full">
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

	<!-- L3 - Services -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>Services</Label>
		{#if services.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each services as service (service.metadata?.uid)}
					<ServiceViewer {service} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full">
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

	<!-- L3 - HTTPRoutes -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>HTTP Routes</Label>
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
										<Dialog.Trigger
											class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
										>
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
			<Empty.Root class="h-full">
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
