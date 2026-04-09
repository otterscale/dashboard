<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		CephRookIoV1CephBlockPool,
		CephRookIoV1CephCluster,
		CephRookIoV1CephFilesystem,
		CephRookIoV1CephObjectStore,
		CoreV1Pod
	} from '@otterscale/types';
	import { getContext, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import { cn } from '$lib/utils';

	import DeploymentViewer from '../related-resources-viewer/deployment.svelte';
	import PodViewer from '../related-resources-viewer/pod.svelte';

	let {
		cluster
	}: {
		cluster: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const namespace = 'rook-ceph';

	// L1 - CephClusters
	let cephClusters = $state<CephRookIoV1CephCluster[]>([]);

	async function fetchCephClusters() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'ceph.rook.io',
				version: 'v1',
				resource: 'cephclusters'
			});
			cephClusters = response.items.map((item) => item.object as CephRookIoV1CephCluster);
		} catch (error) {
			console.error('Failed to fetch CephClusters:', error);
		}
	}

	// L2 - CephBlockPools
	let cephBlockPools = $state<CephRookIoV1CephBlockPool[]>([]);

	async function fetchCephBlockPools() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'ceph.rook.io',
				version: 'v1',
				resource: 'cephblockpools'
			});
			cephBlockPools = response.items.map((item) => item.object as CephRookIoV1CephBlockPool);
		} catch (error) {
			console.error('Failed to fetch CephBlockPools:', error);
		}
	}

	// L2 - CephFilesystems
	let cephFilesystems = $state<CephRookIoV1CephFilesystem[]>([]);

	async function fetchCephFilesystems() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'ceph.rook.io',
				version: 'v1',
				resource: 'cephfilesystems'
			});
			cephFilesystems = response.items.map((item) => item.object as CephRookIoV1CephFilesystem);
		} catch (error) {
			console.error('Failed to fetch CephFilesystems:', error);
		}
	}

	// L2 - CephObjectStores
	let cephObjectStores = $state<CephRookIoV1CephObjectStore[]>([]);

	async function fetchCephObjectStores() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'ceph.rook.io',
				version: 'v1',
				resource: 'cephobjectstores'
			});
			cephObjectStores = response.items.map((item) => item.object as CephRookIoV1CephObjectStore);
		} catch (error) {
			console.error('Failed to fetch CephObjectStores:', error);
		}
	}

	// L3 - Deployments
	let deployments = $state<AppsV1Deployment[]>([]);
	let filteredDeployments = $derived(
		deployments.filter((deployment) =>
			selectedDeploymentFilters.has(
				deployment.metadata?.labels?.['app.kubernetes.io/part-of'] ?? ''
			)
		)
	);

	const deploymentLabelSelectors = $derived(
		[
			...new Set(
				deployments
					.map((deployment) => deployment.metadata?.labels?.['app.kubernetes.io/part-of'] ?? '')
					.filter(Boolean)
			)
		].sort()
	);

	let selectedDeploymentFilters = $derived(
		new SvelteSet<string>(
			deploymentLabelSelectors.find((label) => label === 'rook-ceph-operator')
				? ['rook-ceph-operator']
				: []
		)
	);

	function toggleDeploymentFilter(deploymentFilter: string) {
		if (selectedDeploymentFilters.has(deploymentFilter)) {
			selectedDeploymentFilters.delete(deploymentFilter);
		} else {
			selectedDeploymentFilters.add(deploymentFilter);
		}
	}
	function clearDeploymentFilters() {
		selectedDeploymentFilters.clear();
	}
	function selectAllDeploymentFilters() {
		deploymentLabelSelectors.forEach((deploymentFilter) =>
			selectedDeploymentFilters.add(deploymentFilter)
		);
	}

	async function fetchDeployments() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'apps',
				version: 'v1',
				resource: 'deployments'
			});
			deployments = response.items.map((item) => item.object as AppsV1Deployment);
		} catch (error) {
			console.error('Failed to fetch Deployments:', error);
		}
	}

	// L3 - Pods
	let pods = $state<CoreV1Pod[]>([]);
	let filteredPods = $derived(
		pods.filter((pod) => selectedPodFilters.has(pod.metadata?.labels?.['app'] ?? ''))
	);

	const podLabelSelectors = $derived(
		[...new Set(pods.map((pod) => pod.metadata?.labels?.['app'] ?? '').filter(Boolean))].sort()
	);

	let selectedPodFilters = $derived(
		new SvelteSet<string>(
			podLabelSelectors.find((label) => label === 'rook-ceph-osd')
				? ['rook-ceph-osd']
				: podLabelSelectors.length > 0
					? [podLabelSelectors[0]]
					: []
		)
	);

	function togglePodFilter(podFilter: string) {
		if (selectedPodFilters.has(podFilter)) {
			selectedPodFilters.delete(podFilter);
		} else {
			selectedPodFilters.add(podFilter);
		}
	}
	function clearPodFilters() {
		selectedPodFilters.clear();
	}
	function selectAllPodFilters() {
		podLabelSelectors.forEach((podFilter) => selectedPodFilters.add(podFilter));
	}

	async function fetchPods() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods'
			});
			pods = response.items.map((item) => item.object as CoreV1Pod);
		} catch (error) {
			console.error('Failed to fetch pods:', error);
		}
	}

	onMount(async () => {
		await Promise.allSettled([
			fetchCephClusters(),
			fetchCephBlockPools(),
			fetchCephFilesystems(),
			fetchCephObjectStores(),
			fetchDeployments(),
			fetchPods()
		]);
	});
</script>

<Field.Group class="pb-8">
	<Field.Set>
		{#if cephClusters.length > 0}
			{#each cephClusters as cephCluster, index (index)}
				<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
					<Card.Header>
						{@const health = cephCluster?.status?.ceph?.health}

						<Card.Title>
							<Item.Root class="p-0">
								<Item.Media>
									<HeartPulse size={20} />
								</Item.Media>
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{cephCluster?.metadata?.name}
									</Item.Title>
									<Item.Description>cephclusters</Item.Description>
								</Item.Content>
								<Item.Actions>
									<Describe
										{cluster}
										namespace={cephCluster?.metadata?.namespace ?? namespace}
										group="ceph.rook.io"
										version="v1"
										resource="cephclusters"
										object={cephCluster}
									>
										{#snippet trigger()}
											<Dialog.Trigger
												class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
											>
												<FileSearchIcon size={16} />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Item.Actions>
							</Item.Root>
						</Card.Title>
						<Card.Description>
							<Badge>{health}</Badge>
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-2">
						{@const phase = cephCluster?.status?.phase}
						{@const message = cephCluster?.status?.message}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Title>
									{phase}
								</Item.Title>
								<Item.Description>
									{message}
								</Item.Description>
							</Item.Content>
						</Item.Root>
						{@const details = cephCluster?.status?.ceph?.details ?? {}}
						{#if Object.keys(details).length > 0}
							<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
								{#each Object.entries(details) as [key, value] (key)}
									{@const detail = value as any}
									<Item.Root class="p-0">
										<Item.Content>
											<Item.Title class="text-sm font-medium"
												>{key}
												<Badge variant="outline">{detail.severity}</Badge>
											</Item.Title>
											<Item.Description class="text-xs">
												{detail.message}
											</Item.Description>
										</Item.Content>
									</Item.Root>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<HeartPulse />
					</Empty.Media>
					<Empty.Title>No CephCluster Found</Empty.Title>
					<Empty.Description>
						No CephCluster resources were found in the {namespace} namespace.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<Field.Set class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
		<!-- CephBlockPool -->
		{#if cephBlockPools.length > 0}
			{#each cephBlockPools as cephBlockPool, index (index)}
				<Card.Root class="flex h-full flex-col border-0">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{cephBlockPool?.metadata?.name}
									</Item.Title>
									<Item.Description>cephblockpools</Item.Description>
									<Badge variant="default">{cephBlockPool?.status?.phase}</Badge>
								</Item.Content>
								<Item.Actions>
									<Describe
										{cluster}
										namespace={cephBlockPool?.metadata?.namespace ?? namespace}
										group="ceph.rook.io"
										version="v1"
										resource="cephblockpools"
										object={cephBlockPool}
									>
										{#snippet trigger()}
											<Dialog.Trigger
												class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
											>
												<FileSearchIcon size={16} />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Item.Actions>
							</Item.Root>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if cephBlockPool?.status?.conditions?.length}
							{#each cephBlockPool.status.conditions as condition, index (index)}
								<Item.Root
									class={cn('p-0', condition.status === 'False' ? '**:text-destructive' : '')}
								>
									<Item.Content>
										<Item.Title class="flex items-center gap-2 text-xs">
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
						{:else}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title>{cephBlockPool?.status?.phase}</Item.Title>
									<Item.Description>
										{cephBlockPool?.status?.message ?? 'There is no message.'}
									</Item.Description>
								</Item.Content>
							</Item.Root>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No CephBlockPool Found</Empty.Title>
					<Empty.Description>No CephBlockPool resources were found.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		<!-- CephFilesystem -->
		{#if cephFilesystems.length > 0}
			{#each cephFilesystems as cephFilesystem, index (index)}
				<Card.Root class="flex h-full flex-col border-0">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{cephFilesystem?.metadata?.name}
									</Item.Title>
									<Item.Description>cephfilesystems</Item.Description>
									<Badge variant="default">{cephFilesystem?.status?.phase}</Badge>
								</Item.Content>
								<Item.Actions>
									<Describe
										{cluster}
										namespace={cephFilesystem?.metadata?.namespace ?? namespace}
										group="ceph.rook.io"
										version="v1"
										resource="cephfilesystems"
										object={cephFilesystem}
									>
										{#snippet trigger()}
											<Dialog.Trigger
												class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
											>
												<FileSearchIcon size={16} />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Item.Actions>
							</Item.Root>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if cephFilesystem?.status?.conditions?.length}
							<Card.Content class="flex flex-col gap-1">
								{#each cephFilesystem.status.conditions as condition, ci (ci)}
									<Item.Root
										class={cn('p-0', condition.status === 'False' ? '**:text-destructive' : '')}
									>
										<Item.Content>
											<Item.Title class="flex items-center gap-2 text-xs">
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
							</Card.Content>
						{:else}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title>{cephFilesystem?.status?.phase}</Item.Title>
									<Item.Description>
										{cephFilesystem?.status?.message ?? 'There is no message.'}
									</Item.Description>
								</Item.Content>
							</Item.Root>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No CephFilesystem Found</Empty.Title>
					<Empty.Description>No CephFilesystem resources were found.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}

		<!-- CephObjectStore -->
		{#if cephObjectStores.length > 0}
			{#each cephObjectStores as cephObjectStore, index (index)}
				<Card.Root class="flex h-full flex-col border-0">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{cephObjectStore?.metadata?.name}
									</Item.Title>
									<Item.Description>cephobjectstores</Item.Description>
									<Badge variant="default">{cephObjectStore?.status?.phase}</Badge>
								</Item.Content>
								<Item.Actions>
									<Describe
										{cluster}
										namespace={cephObjectStore?.metadata?.namespace ?? namespace}
										group="ceph.rook.io"
										version="v1"
										resource="cephobjectstores"
										object={cephObjectStore}
									>
										{#snippet trigger()}
											<Dialog.Trigger
												class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
											>
												<FileSearchIcon size={16} />
											</Dialog.Trigger>
										{/snippet}
									</Describe>
								</Item.Actions>
							</Item.Root>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if cephObjectStore?.status?.conditions?.length}
							{#each cephObjectStore.status.conditions as condition, index (index)}
								<Item.Root
									class={cn('p-0', condition.status === 'False' ? '**:text-destructive' : '')}
								>
									<Item.Content>
										<Item.Title class="flex items-center gap-2 text-xs">
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
						{:else}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title>{cephObjectStore?.status?.phase}</Item.Title>
									<Item.Description>
										{cephObjectStore?.status?.message ?? 'There is no message.'}
									</Item.Description>
								</Item.Content>
							</Item.Root>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No CephObjectStore Found</Empty.Title>
					<Empty.Description>No CephObjectStore resources were found.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<!-- L3 - Deployments -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Deployments</Label>
		{#if deployments.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each deploymentLabelSelectors as labelSelector, index (index)}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant={selectedDeploymentFilters.has(labelSelector) ? 'secondary' : 'outline'}
						onclick={() => toggleDeploymentFilter(labelSelector)}
					>
						{labelSelector}
					</Button>
				{/each}
				{#if selectedDeploymentFilters.size > 0}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant="destructive"
						onclick={clearDeploymentFilters}
					>
						Clear
					</Button>
				{:else if selectedDeploymentFilters.size === 0}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant="outline"
						onclick={selectAllDeploymentFilters}
					>
						All
					</Button>
				{/if}
			</div>
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each filteredDeployments as deployment, index (index)}
					<DeploymentViewer {deployment} {cluster} {namespace} />
				{/each}
			</div>
			{#if filteredDeployments.length === 0}
				<Empty.Root class="h-full">
					<Empty.Header>
						<Empty.Media variant="icon">
							<Box />
						</Empty.Media>
						<Empty.Title>No Deployments Match Filter</Empty.Title>
						<Empty.Description>No deployments match the selected filter.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No Deployments Found</Empty.Title>
					<Empty.Description>
						No deployments were found in the {namespace} namespace.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<!-- L3 - Pods -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Pods</Label>
		{#if pods.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each podLabelSelectors as labelSelector, index (index)}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant={selectedPodFilters.has(labelSelector) ? 'secondary' : 'outline'}
						onclick={() => togglePodFilter(labelSelector)}
					>
						{labelSelector}
					</Button>
				{/each}
				{#if selectedPodFilters.size > 0}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant="destructive"
						onclick={clearPodFilters}
					>
						Clear
					</Button>
				{:else if selectedPodFilters.size === 0}
					<Button
						class="rounded-full text-xs"
						size="sm"
						variant="outline"
						onclick={selectAllPodFilters}
					>
						All
					</Button>
				{/if}
			</div>
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each filteredPods as pod, index (index)}
					<PodViewer {pod} {cluster} {namespace} />
				{/each}
			</div>
			{#if filteredPods.length === 0}
				<Empty.Root class="h-full">
					<Empty.Header>
						<Empty.Media variant="icon">
							<Box />
						</Empty.Media>
						<Empty.Title>No Pods Match Filter</Empty.Title>
						<Empty.Description>
							No pods match the selected filter. Try selecting different labels.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Box />
					</Empty.Media>
					<Empty.Title>No Pods Found</Empty.Title>
					<Empty.Description>
						No pods were found in the {namespace} namespace.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
