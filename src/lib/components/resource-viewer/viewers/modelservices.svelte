<script lang="ts" module>
	type ModelServiceComponentType = 'decode' | 'prefill' | 'epp';

	type ModelServiceComponentIdentifier = {
		type: ModelServiceComponentType;
		component: string;
	};

	type ModelServiceComponent = ModelServiceComponentIdentifier & {
		selector: string;
		deployments: AppsV1Deployment[];
		pods: CoreV1Pod[];
		error: string | null;
	};

	const modelServicesComponentIdentifiers: ModelServiceComponentIdentifier[] = [
		{ type: 'decode', component: 'model-decode' },
		{ type: 'prefill', component: 'model-prefill' },
		{ type: 'epp', component: 'model-epp' }
	];
</script>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import type {
		AppsV1Deployment,
		CoreV1Pod,
		ModelOtterscaleIoV1Alpha1ModelService
	} from '@otterscale/types';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Log from '$lib/components/kind-viewer/kind-viewer-actions/default/log.svelte';
	import TerminalAction from '$lib/components/kind-viewer/kind-viewer-actions/default/terminal.svelte';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils';

	let { object }: { object: ModelOtterscaleIoV1Alpha1ModelService } = $props();

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const modelServiceName = $derived(object?.metadata?.name ?? '');

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let modelServiceComponents = $state<ModelServiceComponent[]>([]);

	function buildLabelSelector(labels: Record<string, string>): string {
		return Object.entries(labels)
			.map(([key, value]) => `${key}=${value}`)
			.join(',');
	}

	function getWorkloadSelector(component: string): string {
		if (!modelServiceName) return '';

		const labelSelector = buildLabelSelector({
			'app.kubernetes.io/managed-by': 'model-operator',
			'app.kubernetes.io/component': component,
			'app.kubernetes.io/name': modelServiceName
		});
		return labelSelector;
	}

	function getReady(pod: CoreV1Pod): string {
		const totalContainers = pod?.spec?.containers?.length ?? 0;

		const containerStatuses = pod?.status?.containerStatuses ?? [];
		const readyContainers = containerStatuses.filter(
			(containerStatus) => containerStatus.ready
		).length;

		return `${readyContainers}/${totalContainers}`;
	}

	function getRestart(pod: CoreV1Pod): number {
		return (pod?.status?.containerStatuses ?? []).reduce(
			(a, containerStatus) => a + (containerStatus.restartCount ?? 0),
			0
		);
	}

	function getPodStatus(pod: CoreV1Pod): string {
		const waitingReason = pod?.status?.containerStatuses?.find(
			(containerStatus) => containerStatus.state?.waiting
		)?.state?.waiting?.reason;

		const terminatedReason = pod?.status?.containerStatuses?.find(
			(containerStatus) => containerStatus.state?.terminated
		)?.state?.terminated?.reason;

		return waitingReason ?? terminatedReason ?? pod?.status?.phase ?? 'Unknown';
	}

	let totalPods = $derived.by(() =>
		modelServiceComponents.reduce((a, workload) => a + workload.pods.length, 0)
	);

	function buildResourceUrl(
		name: string,
		group: string,
		version: string,
		kind: string,
		resource: string,
		namespace?: string
	): string {
		return resolve(
			`/(auth)/${page.params.cluster}/${page.params.workspace}/${name}?group=${group}&version=${version}&kind=${kind}&resource=${resource}&namespace=${namespace}`
		);
	}

	async function fetchRelatedWorkloads(
		identifier: ModelServiceComponentIdentifier
	): Promise<ModelServiceComponent> {
		const selector = getWorkloadSelector(identifier.component);

		if (!cluster || !namespace || !modelServiceName || !selector) {
			return {
				...identifier,
				selector,
				deployments: [],
				pods: [],
				error: null
			};
		}

		try {
			const [deploymentResponse, podResponse] = await Promise.all([
				resourceClient.list({
					cluster,
					namespace,
					group: 'apps',
					version: 'v1',
					resource: 'deployments',
					labelSelector: selector
				}),
				resourceClient.list({
					cluster,
					namespace,
					group: '',
					version: 'v1',
					resource: 'pods',
					labelSelector: selector
				})
			]);

			return {
				...identifier,
				selector,
				deployments: deploymentResponse.items.map((item) => item.object as AppsV1Deployment),
				pods: podResponse.items.map((item) => item.object as CoreV1Pod),
				error: null
			};
		} catch (error) {
			console.error(
				`Failed to fetch ${identifier.component} resources for ${modelServiceName}:`,
				error
			);
			return {
				...identifier,
				selector,
				deployments: [],
				pods: [],
				error:
					error instanceof Error
						? error.message
						: `Failed to fetch ${identifier.component} resources.`
			};
		}
	}

	let isResourcesLoaded = $state(false);
	let resourcesError = $state<string | null>(null);
	async function fetchResources() {
		if (!cluster || !namespace || !modelServiceName) {
			modelServiceComponents = modelServicesComponentIdentifiers.map((component) => ({
				...component,
				selector: getWorkloadSelector(component.component),
				deployments: [],
				pods: [],
				error: null
			}));
			isResourcesLoaded = true;
			return;
		}

		try {
			modelServiceComponents = await Promise.all(
				modelServicesComponentIdentifiers.map(fetchRelatedWorkloads)
			);
			if (modelServiceComponents.every((workload) => workload.error)) {
				resourcesError = 'Failed to load any related deployments or pods for this model service.';
			}
		} finally {
			isResourcesLoaded = true;
		}
	}

	let relatedDeployments = $derived.by(() =>
		modelServiceComponents.flatMap((component) =>
			component.deployments.map((deployment) => ({
				title: component.component,
				name: deployment.metadata?.name ?? '',
				namespace: deployment.metadata?.namespace ?? namespace,
				group: 'apps',
				version: 'v1',
				kind: 'Deployment',
				resource: 'deployments',
				selector: component.selector
			}))
		)
	);

	onMount(async () => {
		await fetchResources();
	});

	let summaryItems = $derived.by(() => [
		{ name: 'Model Name', information: object?.spec?.model?.name ?? '-' },
		{ name: 'Namespace', information: namespace || '-' },
		{ name: 'Accelerator', information: object?.spec?.accelerator?.type ?? '-' },
		{ name: 'Status Phase', information: object?.status?.phase ?? '-' },
		{
			name: 'Decode',
			information: `${object?.spec?.decode?.parallelism?.tensor ?? '-'} tensor / ${object?.spec?.decode?.replicas ?? '-'} replicas`
		},
		{
			name: 'Prefill',
			information: object?.spec?.prefill
				? `${object?.spec?.prefill?.parallelism?.tensor ?? '-'} tensor / ${object?.spec?.prefill?.replicas ?? '-'} replicas`
				: 'Not configured'
		},
		{
			name: 'Deployments',
			information: modelServiceComponents
				.map((workload) => `${workload.component}:${workload.deployments.length}`)
				.join(' / ')
		},
		{
			name: 'Pods',
			information: modelServiceComponents
				.map((workload) => `${workload.component}:${workload.pods.length}`)
				.join(' / ')
		},
		{ name: 'Total Pods', information: isResourcesLoaded ? String(totalPods) : 'Loading' }
	]);
</script>

<Field.Group class="pb-8">
	<Field.Set class="grid grid-cols-1 gap-0 rounded-lg bg-muted/50">
		<Card.Root class="flex h-full flex-col border-0 bg-transparent shadow-none">
			{@const conditions = object.status?.conditions ?? []}
			{@const readyCondition = conditions.find((condition) => condition.type === 'Ready')}
			{@const isReady = readyCondition?.status === 'True'}
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<HeartPulse size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Status</Item.Title>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if conditions.length > 0}
					{#if readyCondition}
						<Item.Root class={cn('p-0', !isReady ? '**:text-destructive' : '**:text-none')}>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>
									{readyCondition.reason ?? (isReady ? 'Ready' : 'Not Ready')}
								</Item.Title>
								<Item.Description>{readyCondition.message}</Item.Description>
							</Item.Content>
						</Item.Root>
					{:else}
						{#each [...conditions].sort((previous, next) => {
							const previousTime = new Date(previous.lastTransitionTime ?? 0).getTime();
							const nextTime = new Date(next.lastTransitionTime ?? 0).getTime();
							return nextTime - previousTime;
						}) as condition, index (index)}
							<Item.Root
								class={cn(
									'p-0',
									condition.status === 'False' ? '**:text-destructive' : '**:text-none'
								)}
							>
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{condition.reason ?? condition.type}
									</Item.Title>
									<Item.Description>{condition.message}</Item.Description>
								</Item.Content>
							</Item.Root>
						{/each}
					{/if}
				{:else}
					<Empty.Root class="h-full">
						<Empty.Header>
							<Empty.Media variant="icon">
								<HeartPulse />
							</Empty.Media>
							<Empty.Title>No Status Available</Empty.Title>
							<Empty.Description>
								There are no status conditions to display for this model service.
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="px-4">
			<Separator class="py-px" />
		</div>

		<Card.Root class="flex h-full flex-col border-0 bg-transparent shadow-none">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<Layers size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Model Service</Item.Title>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each summaryItems as item, index (index)}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Description>{item.name}</Item.Description>
							<Item.Title>{item.information}</Item.Title>
						</Item.Content>
					</Item.Root>
				{/each}
			</Card.Content>
		</Card.Root>
	</Field.Set>

	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Related Resources</Label>
		{#if !isResourcesLoaded}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each Array(3) as _, index (index)}
					<div class="rounded-lg border p-4">
						<Skeleton class="h-5 w-1/3" />
						<Skeleton class="mt-4 h-4 w-3/4" />
					</div>
				{/each}
			</div>
		{:else if relatedDeployments.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each relatedDeployments as ref (`${ref.title}-${ref.name}`)}
					<Item.Root variant="outline">
						{#snippet child({ props })}
							<a
								href={buildResourceUrl(
									ref.name,
									ref.group,
									ref.version,
									ref.kind,
									ref.resource,
									ref.namespace
								)}
								target="_blank"
								rel="noopener noreferrer"
								{...props}
							>
								<Item.Content>
									<Item.Description>
										<Badge variant="outline">{ref.title}</Badge>
										{ref.namespace}
									</Item.Description>
									<Item.Title>{ref.name}</Item.Title>
									<Item.Description>
										{ref.resource}.{ref.group ? `${ref.group}/${ref.version}` : ref.version}
									</Item.Description>
									<Item.Description class="font-mono text-xs">{ref.selector}</Item.Description>
								</Item.Content>
								<Item.Actions>
									<ExternalLinkIcon class="size-4" />
								</Item.Actions>
							</a>
						{/snippet}
					</Item.Root>
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Box />
					</Empty.Media>
					<Empty.Title
						>{resourcesError ? 'Failed to Load Resources' : 'No Related Resources'}</Empty.Title
					>
					<Empty.Description>
						{#if resourcesError}
							{resourcesError}
						{:else}
							No related deployments were found for this model service using the assumed workload
							labels.
						{/if}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Pods</Label>
		{#if !isResourcesLoaded}
			<div class="grid gap-4">
				{#each Array(3) as _, index (index)}
					<div class="rounded-lg border p-4">
						<Skeleton class="h-5 w-1/3" />
						<div class="mt-4 grid gap-3 md:grid-cols-3">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-full" />
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid gap-6">
				{#each modelServiceComponents as workload (workload.type)}
					<Card.Root class="border bg-muted/20 shadow-none">
						<Card.Header>
							<Card.Title>
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Title class={typographyVariants({ variant: 'h6' })}>
											{workload.component}
										</Item.Title>
										<Item.Description class="font-mono text-xs">
											{workload.selector || '-'}
										</Item.Description>
									</Item.Content>
									<Item.Actions>
										<Badge variant="secondary">{workload.pods.length} pods</Badge>
									</Item.Actions>
								</Item.Root>
							</Card.Title>
						</Card.Header>
						<Card.Content>
							{#if workload.error}
								<Empty.Root class="h-full">
									<Empty.Header>
										<Empty.Media variant="icon">
											<Box />
										</Empty.Media>
										<Empty.Title>Failed to Load {workload.component}</Empty.Title>
										<Empty.Description>{workload.error}</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{:else if workload.pods.length > 0}
								<div class="grid gap-4">
									{#each workload.pods as pod (pod.metadata?.uid ?? pod.metadata?.name ?? '')}
										<Item.Root variant="outline" class="items-start gap-4 bg-background">
											<Item.Content class="w-full">
												<Item.Description>
													<Badge variant="outline">{workload.component}</Badge>
													<Badge variant="outline">{getPodStatus(pod)}</Badge>
													{pod.metadata?.namespace}
												</Item.Description>
												<Item.Title>
													<a
														class="transition-colors hover:text-primary"
														href={buildResourceUrl(
															pod.metadata?.name ?? '',
															'',
															'v1',
															'Pod',
															'pods',
															pod.metadata?.namespace ?? namespace
														)}
													>
														{pod.metadata?.name}
													</a>
												</Item.Title>
												<Item.Footer class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
													<Item.Root class="p-0">
														<Item.Content>
															<Item.Description>Ready</Item.Description>
															<Item.Title>{getReady(pod)}</Item.Title>
														</Item.Content>
													</Item.Root>
													<Item.Root class="p-0">
														<Item.Content>
															<Item.Description>Restarts</Item.Description>
															<Item.Title>{getRestart(pod)}</Item.Title>
														</Item.Content>
													</Item.Root>
													<Item.Root class="p-0">
														<Item.Content>
															<Item.Description>Node</Item.Description>
															<Item.Title>{pod.spec?.nodeName ?? '-'}</Item.Title>
														</Item.Content>
													</Item.Root>
													<Item.Root class="p-0">
														<Item.Content>
															<Item.Description>Pod IP</Item.Description>
															<Item.Title>{pod.status?.podIP ?? '-'}</Item.Title>
														</Item.Content>
													</Item.Root>
													<Item.Root class="p-0">
														<Item.Content>
															<Item.Description>Selector</Item.Description>
															<Item.Title class="truncate">{workload.component}</Item.Title>
														</Item.Content>
													</Item.Root>
												</Item.Footer>
											</Item.Content>
											<Item.Actions class="w-full max-w-sm self-stretch lg:w-auto">
												<div
													class="grid gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-3 lg:w-[320px]"
												>
													<div class="rounded-md bg-background px-2 py-1">
														<Describe
															{cluster}
															namespace={pod.metadata?.namespace ?? namespace}
															group=""
															version="v1"
															resource="pods"
															object={pod}
														/>
													</div>
													<div class="rounded-md bg-background px-2 py-1">
														<Log {cluster} object={pod} kind="Pod" />
													</div>
													<div class="rounded-md bg-background px-2 py-1">
														<TerminalAction {cluster} object={pod} />
													</div>
												</div>
											</Item.Actions>
										</Item.Root>
									{/each}
								</div>
							{:else}
								<Empty.Root class="h-full">
									<Empty.Header>
										<Empty.Media variant="icon">
											<Box />
										</Empty.Media>
										<Empty.Title>No {workload.component} Pods Found</Empty.Title>
										<Empty.Description>
											No pods matched the selector <strong>{workload.selector}</strong>.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</Field.Set>
</Field.Group>
