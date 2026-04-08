<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import Database from '@lucide/svelte/icons/database';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Pod } from '@otterscale/types';
	import { getContext, onMount } from 'svelte';

	import { typographyVariants } from '$lib/components/typography/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { cn } from '$lib/utils';

	import CrdResourceCard from '../related-resources-viewer/crd-resource.svelte';
	import PersistentVolumeCard from '../related-resources-viewer/persistent-volume.svelte';
	import PersistentVolumeClaimCard from '../related-resources-viewer/persistent-volume-claim.svelte';
	import PodCard from '../related-resources-viewer/pod.svelte';
	import StorageClassCard from '../related-resources-viewer/storage-class.svelte';

	let {
		cluster,
		namespace = 'rook-ceph'
	}: {
		cluster: string;
		namespace?: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// L1 - CephClusters
	let cephClusters = $state<any[]>([]);

	async function fetchCephClusters() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'ceph.rook.io',
				version: 'v1',
				resource: 'cephclusters'
			});
			cephClusters = response.items.map((item) => item.object);
		} catch (error) {
			console.error('Failed to fetch CephClusters:', error);
		}
	}

	// L2 - CRDs
	const crdDefinitions = [
		{ key: 'CephBlockPool', resource: 'cephblockpools' },
		{ key: 'CephFilesystem', resource: 'cephfilesystems' },
		{ key: 'CephObjectStore', resource: 'cephobjectstores' }
	];

	let crdResources = $state<Record<string, any[]>>({});

	async function fetchCrdResources() {
		const results = await Promise.allSettled(
			crdDefinitions.map((def) =>
				resourceClient.list({
					cluster,
					namespace,
					group: 'ceph.rook.io',
					version: 'v1',
					resource: def.resource
				})
			)
		);

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			if (result.status === 'fulfilled') {
				crdResources[crdDefinitions[i].key] = result.value.items.map((item) => item.object);
			} else {
				console.error(`Failed to fetch ${crdDefinitions[i].key}:`, result.reason);
			}
		}
	}

	// L3 - Pods
	let pods = $state<CoreV1Pod[]>([]);

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

	// L4 - Storage
	let storageClasses = $state<any[]>([]);
	let persistentVolumes = $state<any[]>([]);
	let persistentVolumeClaims = $state<any[]>([]);

	async function fetchStorage() {
		const [scResult, pvResult, pvcResult] = await Promise.allSettled([
			resourceClient.list({
				cluster,
				namespace: '',
				group: 'storage.k8s.io',
				version: 'v1',
				resource: 'storageclasses'
			}),
			resourceClient.list({
				cluster,
				namespace: '',
				group: '',
				version: 'v1',
				resource: 'persistentvolumes'
			}),
			resourceClient.list({
				cluster,
				namespace: '',
				group: '',
				version: 'v1',
				resource: 'persistentvolumeclaims'
			})
		]);

		// Filter StorageClasses by ceph/rook provisioner
		if (scResult.status === 'fulfilled') {
			storageClasses = scResult.value.items
				.map((item) => item.object as any)
				.filter((sc) => sc?.provisioner?.includes('ceph') || sc?.provisioner?.includes('rook'));
		}

		const scNames = new Set(storageClasses.map((sc) => sc?.metadata?.name));

		// Filter PVs by ceph StorageClass or CSI driver
		if (pvResult.status === 'fulfilled') {
			persistentVolumes = pvResult.value.items
				.map((item) => item.object as any)
				.filter(
					(pv) =>
						scNames.has(pv?.spec?.storageClassName) ||
						pv?.spec?.csi?.driver?.includes('ceph') ||
						pv?.spec?.csi?.driver?.includes('rook')
				);
		}

		// Filter PVCs by ceph StorageClass
		if (pvcResult.status === 'fulfilled') {
			persistentVolumeClaims = pvcResult.value.items
				.map((item) => item.object as any)
				.filter((pvc) => scNames.has(pvc?.spec?.storageClassName));
		}
	}

	// L1 helpers
	function healthVariant(health: string | undefined): 'default' | 'secondary' | 'destructive' {
		if (health === 'HEALTH_OK') return 'default';
		if (health === 'HEALTH_WARN') return 'secondary';
		return 'destructive';
	}

	function healthLabel(health: string | undefined): string {
		if (health === 'HEALTH_OK') return 'Healthy';
		if (health === 'HEALTH_WARN') return 'Warning';
		if (health === 'HEALTH_ERR') return 'Error';
		return 'Unknown';
	}

	function formatGiB(bytes: number | undefined): string {
		if (!bytes) return '—';
		return (bytes / 1073741824).toFixed(1) + ' GiB';
	}

	const totalCrdCount = $derived(
		Object.values(crdResources).reduce((sum, items) => sum + items.length, 0)
	);

	onMount(async () => {
		await Promise.allSettled([
			fetchCephClusters(),
			fetchCrdResources(),
			fetchPods(),
			fetchStorage()
		]);
	});
</script>

<Field.Group class="pb-8">
	<!-- L1 - Cluster Health -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Cluster Health</Label>
		{#if cephClusters.length > 0}
			{#each cephClusters as cephCluster, index (index)}
				{@const health: any = cephCluster?.status?.ceph?.health}
				{@const phase: any = cephCluster?.status?.phase}
				{@const capacity: any = cephCluster?.status?.ceph?.capacity}
				{@const details: any[] = cephCluster?.status?.ceph?.details ?? {}}
				{@const versions: any[] = cephCluster?.status?.versions?.overall ?? {}}
				{@const cephVersion: any = Object.keys(versions)[0]}

				<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Media>
									<HeartPulse size={20} />
								</Item.Media>
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{cephCluster?.metadata?.name}
									</Item.Title>
								</Item.Content>
							</Item.Root>
						</Card.Title>
						<Card.Description>
							<Badge variant={healthVariant(health)}>{healthLabel(health)}</Badge>
							{#if phase}
								<Badge
									variant={phase === 'Ready'
										? 'default'
										: phase === 'Progressing'
											? 'secondary'
											: 'destructive'}
								>
									{phase}
								</Badge>
							{/if}
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
						{@const summaries = [
							{ name: 'FSID', information: cephCluster?.status?.ceph?.fsid },
							{
								name: 'Capacity',
								information: capacity
									? `${formatGiB(capacity.bytesUsed)} / ${formatGiB(capacity.bytesTotal)}`
									: undefined
							},
							{ name: 'Ceph Version', information: cephVersion },
							{
								name: 'OSD Count',
								information: cephCluster?.status?.ceph?.versions?.osd
									? Object.keys(cephCluster.status.ceph.versions.osd)[0]
									: undefined
							}
						]}
						{#each summaries as item, i (i)}
							{#if item.information}
								<Item.Root class="p-0">
									<Item.Content>
										<Item.Description>{item.name}</Item.Description>
										<Item.Title>{item.information}</Item.Title>
									</Item.Content>
								</Item.Root>
							{/if}
						{/each}
					</Card.Content>
					{#if Object.keys(details).length > 0}
						<Separator class="mx-4" />
						<Card.Content class="flex flex-col gap-2">
							{#each Object.values(details) as detail}
								<Item.Root class={cn('p-0', '**:text-amber-700')}>
									<Item.Content>
										<Item.Description>{detail.message}</Item.Description>
									</Item.Content>
								</Item.Root>
							{/each}
						</Card.Content>
					{/if}
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

	<!-- L2 - CRD Status -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>CRD Status</Label>
		{#if totalCrdCount > 0}
			<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{#each crdDefinitions as def}
					{#each crdResources[def.key] ?? [] as item, index (index)}
						<CrdResourceCard
							object={item}
							{cluster}
							{namespace}
							group="ceph.rook.io"
							version="v1"
							resource={def.resource}
						/>
					{/each}
				{/each}
			</div>
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Layers />
					</Empty.Media>
					<Empty.Title>No CRDs Found</Empty.Title>
					<Empty.Description>
						No CephBlockPool, CephFilesystem, or CephObjectStore resources were found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<!-- L3 - Pods -->
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
					<Empty.Description>
						No pods were found in the {namespace} namespace.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>

	<!-- L4 - Storage -->
	<Field.Set>
		<Label class={typographyVariants({ variant: 'h4' })}>Storage</Label>

		{#if storageClasses.length > 0 || persistentVolumes.length > 0 || persistentVolumeClaims.length > 0}
			{#if storageClasses.length > 0}
				<Label class={typographyVariants({ variant: 'h6' })}>StorageClass</Label>
				<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
					{#each storageClasses as sc, index (index)}
						<StorageClassCard storageClass={sc} {cluster} />
					{/each}
				</div>
			{/if}

			{#if persistentVolumes.length > 0}
				<Label class={typographyVariants({ variant: 'h6' })}>PersistentVolume</Label>
				<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
					{#each persistentVolumes as pv, index (index)}
						<PersistentVolumeCard persistentVolume={pv} {cluster} />
					{/each}
				</div>
			{/if}

			{#if persistentVolumeClaims.length > 0}
				<Label class={typographyVariants({ variant: 'h6' })}>PersistentVolumeClaim</Label>
				<div class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
					{#each persistentVolumeClaims as pvc, index (index)}
						<PersistentVolumeClaimCard
							persistentVolumeClaim={pvc}
							{cluster}
							namespace={pvc?.metadata?.namespace ?? ''}
						/>
					{/each}
				</div>
			{/if}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Database />
					</Empty.Media>
					<Empty.Title>No Storage Resources</Empty.Title>
					<Empty.Description>
						No Ceph-related StorageClass, PersistentVolume, or PersistentVolumeClaim resources were
						found.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
