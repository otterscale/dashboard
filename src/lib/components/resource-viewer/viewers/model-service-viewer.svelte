<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		CoreV1Pod,
		ModelOtterscaleIoV1Alpha1ModelService
	} from '@otterscale/types';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import { cn } from '$lib/utils';

	import DeploymentCard from '../related-resources-viewer/deployment.svelte';
	import PodCard from '../related-resources-viewer/pod.svelte';

	let { object }: { object: ModelOtterscaleIoV1Alpha1ModelService } = $props();

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const modelServiceName = $derived(object?.metadata?.name ?? '');

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	function buildLabelSelector(labels: Record<string, string>): string {
		return Object.entries(labels)
			.map(([key, value]) => `${key}=${value}`)
			.join(',');
	}

	let deployments: AppsV1Deployment[] = $state([]);
	async function fetchDeployments() {
		deployments = [];

		if (!cluster || !namespace || !modelServiceName) {
			return;
		}

		const labels = [
			{ name: modelServiceName, component: 'model-decode' },
			{ name: modelServiceName, component: 'model-prefill' },
			{ name: `${modelServiceName}-epp`, component: 'epp' }
		];
		for (const label of labels) {
			try {
				const response = await resourceClient.list({
					cluster,
					namespace,
					group: 'apps',
					version: 'v1',
					resource: 'deployments',
					labelSelector: buildLabelSelector({
						'app.kubernetes.io/managed-by': 'model-operator',
						'app.kubernetes.io/component': label.component,
						'app.kubernetes.io/name': label.name
					})
				});

				deployments = [
					...deployments,
					...response.items.map((item) => item.object as AppsV1Deployment)
				];
			} catch (error) {
				console.error(
					`Failed to fetch ${label.component} resources for ${modelServiceName}:`,
					error
				);
			}
		}
	}

	let pods: CoreV1Pod[] = $state([]);
	async function fetchPods() {
		pods = [];

		if (!cluster || !namespace || !modelServiceName) {
			return;
		}

		const labels = [
			{ name: modelServiceName, component: 'model-decode' },
			{ name: modelServiceName, component: 'model-prefill' },
			{ name: `${modelServiceName}-epp`, component: 'epp' }
		];
		for (const label of labels) {
			try {
				const response = await resourceClient.list({
					cluster,
					namespace,
					group: '',
					version: 'v1',
					resource: 'pods',
					labelSelector: buildLabelSelector({
						'app.kubernetes.io/managed-by': 'model-operator',
						'app.kubernetes.io/component': label.component,
						'app.kubernetes.io/name': label.name
					})
				});

				pods = [...pods, ...response.items.map((item) => item.object as CoreV1Pod)];
			} catch (error) {
				console.error(
					`Failed to fetch ${label.component} resources for ${modelServiceName}:`,
					error
				);
			}
		}
	}

	onMount(async () => {
		await fetchDeployments();
		await fetchPods();
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
								There are no status conditions to display for this model service.
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>
		<Card.Root class="flex h-full flex-col border-0 border-none bg-muted/50 shadow-none">
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
				{@const summaries = [
					{ title: 'Name', information: object?.spec?.model?.name },
					{ title: 'Namespace', information: namespace },
					{ title: 'Status', information: object?.status?.phase ?? '-' },
					{ title: 'Accelerator', information: object?.spec?.accelerator?.type },
					{
						title: 'Decode',
						information: `${object?.spec?.decode?.parallelism?.tensor ?? '-'} tensor / ${object?.spec?.decode?.replicas ?? '-'} replicas`
					},
					{
						title: 'Prefill',
						information: object?.spec?.prefill
							? `${object?.spec?.prefill?.parallelism?.tensor ?? '-'} tensor / ${object?.spec?.prefill?.replicas ?? '-'} replicas`
							: undefined
					},
					{
						title: 'Deployments',
						information: deployments.length
					},

					{ title: 'Pods', information: pods.length }
				]}
				{#each summaries as summary, index (index)}
					{#if summary.information}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Description>{summary.title}</Item.Description>
								<Item.Title>{summary.information}</Item.Title>
							</Item.Content>
						</Item.Root>
					{/if}
				{/each}
			</Card.Content>
		</Card.Root>
	</Field.Set>

	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Related Resources</Label>
		{#if deployments.length > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each deployments as deployment, index (index)}
					<DeploymentCard {deployment} {cluster} {namespace} />
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Box />
					</Empty.Media>
					<Empty.Title>No Related Deployments</Empty.Title>
					<Empty.Description>
						No related deployments were found for this model service using the assumed workload
						labels.
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
		{/if}
	</Field.Set>
</Field.Group>
