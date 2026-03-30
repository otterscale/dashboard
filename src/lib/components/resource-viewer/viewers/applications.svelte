<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		CircleIcon,
		FileSearchIcon,
		ScrollTextIcon,
		TerminalSquareIcon,
		XIcon
	} from '@lucide/svelte';
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
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Log from '$lib/components/kind-viewer/kind-viewer-actions/default/log.svelte';
	import Terminal from '$lib/components/kind-viewer/kind-viewer-actions/default/terminal.svelte';
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

	let { object }: { object: WorkloadOtterscaleIoV1Alpha1Application } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const applicationName = $derived(object?.metadata?.name ?? '');

	function getContainerReadies(pod: CoreV1Pod): number {
		const containerStatuses = pod?.status?.containerStatuses ?? [];
		const readyContainers = containerStatuses.filter(
			(containerStatus) => containerStatus.ready
		).length;

		return readyContainers;
	}

	function getContainerRestarts(pod: CoreV1Pod): number {
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

	async function fetchRelatedResources() {
		if (!cluster || !namespace || !applicationName) {
			return;
		}

		try {
			const deploymentResponse = await resourceClient.get({
				cluster: cluster,
				name: object?.status?.deploymentRef?.name,
				namespace: object?.status?.deploymentRef?.namespace,
				group: 'apps',
				version: 'v1',
				resource: 'deployments'
			});

			lodash.set(relatedResources, 'Deployment', deploymentResponse.object as AppsV1Deployment);

			const serviceResponse = await resourceClient.get({
				cluster: cluster,
				name: object?.status?.serviceRef?.name,
				namespace: object?.status?.serviceRef?.namespace,
				group: '',
				version: 'v1',
				resource: 'services'
			});

			lodash.set(relatedResources, 'Service', serviceResponse.object as CoreV1Service);

			const persistentVolumeClaimResponse = await resourceClient.get({
				cluster: cluster,
				name: object?.status?.persistentVolumeClaimRef?.name,
				namespace: object?.status?.persistentVolumeClaimRef?.namespace,
				group: '',
				version: 'v1',
				resource: 'persistentvolumeclaims'
			});

			lodash.set(
				relatedResources,
				'PersistentVolumeClaim',
				persistentVolumeClaimResponse.object as CoreV1PersistentVolumeClaim
			);

			const cronJobResponse = await resourceClient.get({
				cluster: cluster,
				name: object?.status?.cronJobRef?.name,
				namespace: object?.status?.cronJobRef?.namespace,
				group: 'batch',
				version: 'v1',
				resource: 'cronjobs'
			});

			lodash.set(relatedResources, 'Cronjob', cronJobResponse.object as BatchV1CronJob);

			const jobResponse = await resourceClient.get({
				cluster: cluster,
				name: object?.status?.jobRef?.name,
				namespace: object?.status?.jobRef?.namespace,
				group: 'batch',
				version: 'v1',
				resource: 'jobs'
			});

			lodash.set(relatedResources, 'Job', jobResponse.object as BatchV1Job);
		} catch (error) {
			console.error(`Failed to fetch pods for application ${applicationName}:`, error);
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
						{@const deployment = resource as AppsV1Deployment}
						<Card.Root>
							<Card.Header>
								<Card.Title>{deployment?.metadata?.name}</Card.Title>
								<Card.Description>
									{@const availability = deployment.status?.conditions?.find(
										(condition) => condition.type === 'Available'
									)}
									{#if availability?.status === 'True'}
										<Badge>Available</Badge>
									{:else}
										<Badge variant="destructive">Unavailable</Badge>
									{/if}
								</Card.Description>
								<Card.Action>
									<Describe
										{cluster}
										namespace={deployment?.metadata?.namespace ?? namespace}
										group="apps"
										version="v1"
										resource="deployments"
										object={deployment}
									>
										{#snippet trigger()}
											<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
												<FileSearchIcon />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-2">
								{@const conditions = deployment?.status?.conditions ?? []}
								{#each conditions as condition, index (index)}
									<Item.Root class="p-0">
										<Item.Media>
											{#if condition.status === 'True'}
												<CircleIcon />
											{:else}
												<XIcon />
											{/if}
										</Item.Media>
										<Item.Content>
											<Item.Title>{condition.type}</Item.Title>
											<Item.Description>{condition.reason}</Item.Description>
											{condition.message}
										</Item.Content>
										<Item.Actions>{condition.lastUpdateTime}</Item.Actions>
									</Item.Root>
								{/each}
							</Card.Content>
						</Card.Root>
					{:else if kind === 'Service'}
						{@const service = resource as CoreV1Service}
						<Card.Root>
							<Card.Header>
								<Card.Title>{service?.metadata?.name}</Card.Title>
								<Card.Description>
									<Badge>{service?.spec?.type}</Badge>
								</Card.Description>
								<Card.Action>
									<Describe
										{cluster}
										namespace={service?.metadata?.namespace ?? namespace}
										group=""
										version="v1"
										resource="services"
										object={service}
									>
										{#snippet trigger()}
											<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
												<FileSearchIcon />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-2">
								{@const ports = service?.spec?.ports ?? []}
								{#each ports as port, index (index)}
									{#if port.name}
										<Item.Root class="p-0">
											<Item.Content>
												<Item.Title>Name</Item.Title>
												<Item.Description>{port.name}</Item.Description>
											</Item.Content>
										</Item.Root>
									{/if}
									{#if port.protocol}
										<Item.Root class="p-0">
											<Item.Content>
												<Item.Title>Protocol</Item.Title>
												<Item.Description>{port.protocol}</Item.Description>
											</Item.Content>
										</Item.Root>
									{/if}
									{#if port.nodePort}
										<Item.Root class="p-0">
											<Item.Content>
												<Item.Title>Node Port</Item.Title>
												<Item.Description>{port.nodePort}</Item.Description>
											</Item.Content>
										</Item.Root>
									{/if}
									{#if port.port}
										<Item.Root class="p-0">
											<Item.Content>
												<Item.Title>Port</Item.Title>
												<Item.Description>{port.port}</Item.Description>
											</Item.Content>
										</Item.Root>
									{/if}
									{#if port.targetPort}
										<Item.Root class="p-0">
											<Item.Content>
												<Item.Title>Target Port</Item.Title>
												<Item.Description>{port.targetPort}</Item.Description>
											</Item.Content>
										</Item.Root>
									{/if}
								{/each}
							</Card.Content>
						</Card.Root>
					{:else if kind === 'PersistentVolumeClaim'}
						{@const persistentVolumeClaim = resource as CoreV1PersistentVolumeClaim}
						<Card.Root>
							<Card.Header>
								<Card.Title>{persistentVolumeClaim?.metadata?.name}</Card.Title>
								<Card.Description>
									<Badge>{persistentVolumeClaim?.status?.phase}</Badge>
								</Card.Description>
								<Card.Action>
									<Describe
										{cluster}
										namespace={persistentVolumeClaim?.metadata?.namespace ?? namespace}
										group=""
										version="v1"
										resource="persistentvolumeclaims"
										object={persistentVolumeClaim}
									>
										{#snippet trigger()}
											<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
												<FileSearchIcon />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-2">
								{@const accessModes = persistentVolumeClaim?.status?.accessModes ?? []}
								<p class="text-xl">{persistentVolumeClaim?.status?.capacity?.storage}</p>
								{#each accessModes as accessMode, index (index)}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Access Mode</Item.Title>
											<Item.Description>{accessMode}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/each}
							</Card.Content>
						</Card.Root>
					{:else if kind === 'Cronjob'}
						{@const cronjob = resource as BatchV1CronJob}
						<Card.Root>
							<Card.Header>
								<Card.Title>{cronjob?.metadata?.name}</Card.Title>
								<Card.Description>
									<Badge>{cronjob?.status?.phase}</Badge>
								</Card.Description>
								<Card.Action>
									<Describe
										{cluster}
										namespace={cronjob?.metadata?.namespace ?? namespace}
										group="batch"
										version="v1"
										resource="cronjobs"
										object={cronjob}
									>
										{#snippet trigger()}
											<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
												<FileSearchIcon />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-2">
								{#if cronjob.spec?.schedule}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Schedule</Item.Title>
											<Item.Description>{cronjob.spec?.schedule}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/if}
								{#if cronjob?.spec?.timeZone}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Time Zone</Item.Title>
											<Item.Description>{cronjob.spec?.timeZone}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/if}
								{#if cronjob?.status?.active}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Active</Item.Title>
											<Item.Description>{cronjob.status?.active?.length}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/if}
								{#if cronjob?.status?.lastScheduleTime}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Last Schedule Time</Item.Title>
											<Item.Description>{cronjob.status?.lastScheduleTime}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/if}
								{#if cronjob?.status?.lastSuccessfulTime}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title>Last Successful Time</Item.Title>
											<Item.Description>{cronjob.status?.lastSuccessfulTime}</Item.Description>
										</Item.Content>
									</Item.Root>
								{/if}
							</Card.Content>
						</Card.Root>
					{:else if kind === 'Job'}
						{@const job = resource as BatchV1Job}
						<Card.Root>
							<Card.Header>
								<Card.Title>{job?.metadata?.name}</Card.Title>
								<Card.Description>
									{@const completeCondition = job?.status?.conditions?.find(
										(condition) => condition.type === 'Complete'
									)}
									{@const isComplete = completeCondition?.status === 'True'}
									{#if completeCondition}
										<Badge variant={isComplete ? 'default' : 'destructive'}>
											{isComplete ? 'Complete' : 'Incomplete'}
										</Badge>
									{/if}
								</Card.Description>
								<Card.Action>
									<Describe
										{cluster}
										namespace={job?.metadata?.namespace ?? namespace}
										group="batch"
										version="v1"
										resource="jobs"
										object={job}
									>
										{#snippet trigger()}
											<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
												<FileSearchIcon />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Card.Action>
							</Card.Header>
							<Card.Content class="flex flex-col gap-2">
								{@const conditions = job?.status?.conditions ?? []}
								{#each conditions as condition, index (index)}
									<Item.Root class="p-0">
										<Item.Media>
											{#if condition.status === 'True'}
												<CircleIcon />
											{:else}
												<XIcon />
											{/if}
										</Item.Media>
										<Item.Content>
											<Item.Title>{condition.type}</Item.Title>
											<Item.Description>{condition.reason}</Item.Description>
											{condition.message}
										</Item.Content>
										<Item.Actions>{condition.lastUpdateTime}</Item.Actions>
									</Item.Root>
								{/each}
							</Card.Content>
						</Card.Root>
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
					<Card.Root>
						<Card.Header>
							<Card.Title>{pod?.metadata?.name}</Card.Title>
							<Card.Description>
								<Badge>{getPodStatus(pod)}</Badge>
							</Card.Description>
							<Card.Action class="flex items-center">
								<Describe
									{cluster}
									namespace={pod?.metadata?.namespace ?? namespace}
									group=""
									version="v1"
									resource="pods"
									object={pod}
								>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
											<FileSearchIcon />
										</Dialog.Trigger>
									{/snippet}
								</Describe>
								<Log {cluster} object={pod} kind="Pod">
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
											<ScrollTextIcon />
										</Dialog.Trigger>
									{/snippet}
								</Log>
								<Terminal {cluster} object={pod}>
									{#snippet trigger()}
										<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
											<TerminalSquareIcon />
										</Dialog.Trigger>
									{/snippet}
								</Terminal>
							</Card.Action>
						</Card.Header>
						<Card.Content class="flex items-center gap-4 text-lg">
							<p>{getContainerRestarts(pod)} Restart</p>
							<p>{getContainerReadies(pod)} Ready</p>
						</Card.Content>
					</Card.Root>
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
