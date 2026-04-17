<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		BatchV1CronJob,
		BatchV1Job,
		CoreV1PersistentVolumeClaim,
		CoreV1Pod,
		CoreV1Service,
		WorkloadOtterscaleIoV1Alpha1Application
	} from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import { cn } from '$lib/utils';

	import CronjobCard from '../related-resources-viewer/cronjob.svelte';
	import DeploymentCard from '../related-resources-viewer/deployment.svelte';
	import JobCard from '../related-resources-viewer/job.svelte';
	import PersistentVolumeClaimCard from '../related-resources-viewer/persistent-volume-claim.svelte';
	import PodCard from '../related-resources-viewer/pod.svelte';
	import ServiceCard from '../related-resources-viewer/service.svelte';

	let { object }: { object: WorkloadOtterscaleIoV1Alpha1Application } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const applicationName = $derived(object?.metadata?.name ?? '');

	let pods = $state<CoreV1Pod[]>([]);

	async function fetchPods() {
		pods = [];

		if (!cluster || !namespace || !applicationName) {
			return;
		}

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: `app=app-${applicationName}`
			});

			pods = response.items.map((item) => item.object as CoreV1Pod);
		} catch (error) {
			console.error(`Failed to fetch pods for application ${applicationName}:`, error);
		}
	}

	let relatedResources = $state({});

	const relatedResourceDefinitions = [
		{
			key: 'Deployment',
			name: object?.status?.deploymentRef?.name,
			namespace: object?.status?.deploymentRef?.namespace,
			group: 'apps',
			version: 'v1',
			resource: 'deployments'
		},
		{
			key: 'Service',
			name: object?.status?.serviceRef?.name,
			namespace: object?.status?.serviceRef?.namespace,
			group: '',
			version: 'v1',
			resource: 'services'
		},
		{
			key: 'PersistentVolumeClaim',
			name: object?.status?.persistentVolumeClaimRef?.name,
			namespace: object?.status?.persistentVolumeClaimRef?.namespace,
			group: '',
			version: 'v1',
			resource: 'persistentvolumeclaims'
		},
		{
			key: 'Cronjob',
			name: object?.status?.cronJobRef?.name,
			namespace: object?.status?.cronJobRef?.namespace,
			group: 'batch',
			version: 'v1',
			resource: 'cronjobs'
		},
		{
			key: 'Job',
			name: object?.status?.jobRef?.name,
			namespace: object?.status?.jobRef?.namespace,
			group: 'batch',
			version: 'v1',
			resource: 'jobs'
		}
	];

	async function fetchRelatedResources() {
		if (!cluster || !namespace || !applicationName) {
			return;
		}

		const results = await Promise.allSettled(
			relatedResourceDefinitions.map((def) =>
				resourceClient.get({
					cluster,
					name: def.name!,
					namespace: def.namespace!,
					group: def.group,
					version: def.version,
					resource: def.resource
				})
			)
		);

		for (let index = 0; index < results.length; index++) {
			const result = results[index];
			if (result.status === 'fulfilled') {
				lodash.set(relatedResources, relatedResourceDefinitions[index].key, result.value.object);
			} else {
				console.error(
					`Failed to fetch ${relatedResourceDefinitions[index].key} for application ${applicationName}:`,
					result.reason
				);
			}
		}
	}

	onMount(async () => {
		await fetchPods();
		await fetchRelatedResources();
	});
</script>

<Field.Group class="pb-8">
	<Field.Set>
		<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
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

		<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
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
				{@const summaries = [
					{ name: 'Name', information: object?.metadata?.name },
					{ name: 'Namespace', information: object?.metadata?.namespace },
					{ name: 'Type', information: object?.spec?.workloadType },
					{ name: 'Related Resources', information: Object.keys(relatedResources).length },
					{ name: 'Pods', information: pods.length }
				]}
				{#each summaries as item, index (index)}
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
		{#if Object.keys(relatedResources).length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each Object.entries(relatedResources) as [kind, resource], index (index)}
					{#if kind === 'Deployment'}
						<DeploymentCard deployment={resource as AppsV1Deployment} {cluster} {namespace} />
					{:else if kind === 'Service'}
						<ServiceCard service={resource as CoreV1Service} {cluster} {namespace} />
					{:else if kind === 'PersistentVolumeClaim'}
						<PersistentVolumeClaimCard
							persistentVolumeClaim={resource as CoreV1PersistentVolumeClaim}
							{cluster}
							{namespace}
						/>
					{:else if kind === 'Cronjob'}
						<CronjobCard cronjob={resource as BatchV1CronJob} {cluster} {namespace} />
					{:else if kind === 'Job'}
						<JobCard job={resource as BatchV1Job} {cluster} {namespace} />
					{/if}
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
		{#if pods.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each pods as pod, index (index)}
					<PodCard {pod} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Box />
					</Empty.Media>
					<Empty.Title>No Pods Found</Empty.Title>
					<Empty.Description>No pods matched the selector for this application.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
