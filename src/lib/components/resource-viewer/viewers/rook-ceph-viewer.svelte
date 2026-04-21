<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService, WatchEvent_Type } from '@otterscale/api/resource/v1';
	import type {
		AppsV1Deployment,
		CephRookIoV1CephBlockPool,
		CephRookIoV1CephCluster,
		CephRookIoV1CephFilesystem,
		CephRookIoV1CephObjectStore,
		CoreV1Pod
	} from '@otterscale/types';
	import { getContext, onDestroy, onMount } from 'svelte';
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

	type TargetResource =
		| CephRookIoV1CephCluster
		| CephRookIoV1CephBlockPool
		| CephRookIoV1CephFilesystem
		| CephRookIoV1CephObjectStore
		| AppsV1Deployment
		| CoreV1Pod;
	// AbortController is used to terminate all watch streams when the component is destroyed
	const abortController = new AbortController();

	const getKey = (o: any) => o?.metadata?.uid ?? o?.metadata?.name ?? '';
	async function listAndWatch<T extends TargetResource>(
		identifier: { group: string; version: string; resource: string },
		setObjects: (items: T[]) => void,
		updateObject: (updater: (previous: T[]) => T[]) => void
	) {
		while (!abortController.signal.aborted) {
			let resourceVersion = '';

			// === 1. List: Get initial snapshot ===
			try {
				const response = await resourceClient.list(
					{
						cluster,
						namespace,
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

	// L1 - CephClusters
	let cephClusters = $state<CephRookIoV1CephCluster[]>([]);

	// L2 - CephBlockPools
	let cephBlockPools = $state<CephRookIoV1CephBlockPool[]>([]);

	// L2 - CephFilesystems
	let cephFilesystems = $state<CephRookIoV1CephFilesystem[]>([]);

	// L2 - CephObjectStores
	let cephObjectStores = $state<CephRookIoV1CephObjectStore[]>([]);

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

	let selectedDeploymentFilters = new SvelteSet<string>(['rook-ceph-operator']);

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

	// L3 - Pods
	let pods = $state<CoreV1Pod[]>([]);
	let filteredPods = $derived(
		pods.filter((pod) => selectedPodFilters.has(pod.metadata?.labels?.['app'] ?? ''))
	);

	const podLabelSelectors = $derived(
		[...new Set(pods.map((pod) => pod.metadata?.labels?.['app'] ?? '').filter(Boolean))].sort()
	);

	let selectedPodFilters = new SvelteSet<string>(['rook-ceph-osd']);

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

	onMount(() => {
		listAndWatch<CephRookIoV1CephCluster>(
			{ group: 'ceph.rook.io', version: 'v1', resource: 'cephclusters' },
			(items) => (cephClusters = items),
			(updater) => (cephClusters = updater(cephClusters))
		);
		listAndWatch<CephRookIoV1CephBlockPool>(
			{ group: 'ceph.rook.io', version: 'v1', resource: 'cephblockpools' },
			(items) => (cephBlockPools = items),
			(updater) => (cephBlockPools = updater(cephBlockPools))
		);
		listAndWatch<CephRookIoV1CephFilesystem>(
			{ group: 'ceph.rook.io', version: 'v1', resource: 'cephfilesystems' },
			(items) => (cephFilesystems = items),
			(updater) => (cephFilesystems = updater(cephFilesystems))
		);
		listAndWatch<CephRookIoV1CephObjectStore>(
			{ group: 'ceph.rook.io', version: 'v1', resource: 'cephobjectstores' },
			(items) => (cephObjectStores = items),
			(updater) => (cephObjectStores = updater(cephObjectStores))
		);
		listAndWatch<AppsV1Deployment>(
			{ group: 'apps', version: 'v1', resource: 'deployments' },
			(items) => (deployments = items),
			(updater) => (deployments = updater(deployments))
		);
		listAndWatch<CoreV1Pod>(
			{ group: '', version: 'v1', resource: 'pods' },
			(items) => (pods = items),
			(updater) => (pods = updater(pods))
		);
	});

	onDestroy(() => {
		abortController.abort();
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

	<!-- Deployments -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>Deployments</Label>
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

	<!-- Pods -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h6' })}>Pods</Label>
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
