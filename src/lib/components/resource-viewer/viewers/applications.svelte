<script lang="ts" module>
	type RelatedResource = {
		name: string;
		namespace?: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		title: string;
	};

	type ResourceRef = { name: string; namespace?: string } | null | undefined;
</script>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import type { CoreV1Pod, WorkloadOtterscaleIoV1Alpha1Application } from '@otterscale/types';
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

	let { object }: { object: WorkloadOtterscaleIoV1Alpha1Application } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let pods = $state<CoreV1Pod[]>([]);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const applicationName = $derived(object?.metadata?.name ?? '');

	const podLabelSelector = $derived(applicationName ? `app=app-${applicationName}` : '');

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
			(sum, containerStatus) => sum + (containerStatus.restartCount ?? 0),
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

	function buildResourceUrl(
		name: string,
		group: string,
		version: string,
		kind: string,
		resource: string,
		resourceNamespace?: string
	): string {
		let query = `?group=${group}&version=${version}&kind=${kind}&resource=${resource}`;
		if (resourceNamespace) {
			query += `&namespace=${resourceNamespace}`;
		}
		return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}/${name}${query}`);
	}

	let isPodsLoaded = $state(false);
	let podsError = $state<string | null>(null);
	async function fetchPods() {
		if (!cluster || !namespace || !applicationName || !podLabelSelector) {
			pods = [];
			isPodsLoaded = true;
			return;
		}

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: podLabelSelector
			});

			pods = response.items.map((item) => item.object as CoreV1Pod);
		} catch (error) {
			console.error(`Failed to fetch pods for application ${applicationName}:`, error);
			pods = [];
			podsError = error instanceof Error ? error.message : 'Failed to fetch pods.';
		} finally {
			isPodsLoaded = true;
		}
	}

	onMount(async () => {
		await fetchPods();
	});

	let relatedResources = $derived.by(() => {
		const refs: RelatedResource[] = [];
		const status = object?.status;
		const objectNamespace = object?.metadata?.namespace;
		if (!status) return refs;

		const singleRefs: {
			ref: ResourceRef;
			group: string;
			version: string;
			kind: string;
			resource: string;
			title: string;
		}[] = [
			{
				ref: status.deploymentRef as ResourceRef,
				group: 'apps',
				version: 'v1',
				kind: 'Deployment',
				resource: 'deployments',
				title: 'Deployment'
			},
			{
				ref: status.cronJobRef as ResourceRef,
				group: 'batch',
				version: 'v1',
				kind: 'CronJob',
				resource: 'cronjobs',
				title: 'CronJob'
			},
			{
				ref: status.jobRef as ResourceRef,
				group: 'batch',
				version: 'v1',
				kind: 'Job',
				resource: 'jobs',
				title: 'Job'
			},
			{
				ref: status.serviceRef as ResourceRef,
				group: '',
				version: 'v1',
				kind: 'Service',
				resource: 'services',
				title: 'Service'
			},
			{
				ref: status.persistentVolumeClaimRef as ResourceRef,
				group: '',
				version: 'v1',
				kind: 'PersistentVolumeClaim',
				resource: 'persistentvolumeclaims',
				title: 'PVC'
			}
		];

		for (const { ref, group, version, kind, resource, title } of singleRefs) {
			if (ref?.name) {
				refs.push({
					name: ref.name,
					namespace: ref.namespace ?? objectNamespace,
					group,
					version,
					kind,
					resource,
					title
				});
			}
		}

		return refs;
	});

	let summaryItems = $derived.by(() => [
		{ name: 'Workload Type', information: object?.spec?.workloadType ?? 'Unknown' },
		{ name: 'Namespace', information: namespace || '-' },
		{ name: 'Pod Selector', information: podLabelSelector || '-' },
		{ name: 'Related Resources', information: String(relatedResources.length) },
		{ name: 'Pods', information: isPodsLoaded ? String(pods.length) : 'Loading' }
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
								There are no status conditions to display for this application.
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
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Application</Item.Title>
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
		{#if relatedResources.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each relatedResources as ref (ref.kind + ref.name)}
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
					<Empty.Title>No Related Resources</Empty.Title>
					<Empty.Description>
						There are no related resources to display for this application.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Pods</Label>
		{#if !isPodsLoaded}
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
		{:else if pods.length > 0}
			<div class="grid gap-4">
				{#each pods as pod (pod.metadata?.uid ?? pod.metadata?.name ?? '')}
					<Item.Root variant="outline" class="items-start gap-4">
						<Item.Content class="w-full">
							<Item.Description>
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
										<Item.Title>{podLabelSelector}</Item.Title>
									</Item.Content>
								</Item.Root>
							</Item.Footer>
						</Item.Content>
						<Item.Actions class="w-full max-w-sm self-stretch lg:w-auto">
							<div class="grid gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-3 lg:w-[320px]">
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
					<Empty.Title>{podsError ? 'Failed to Load Pods' : 'No Pods Found'}</Empty.Title>
					<Empty.Description>
						{#if podsError}
							{podsError}
						{:else}
							No pods matched the selector <strong>{podLabelSelector}</strong> for this application.
						{/if}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
