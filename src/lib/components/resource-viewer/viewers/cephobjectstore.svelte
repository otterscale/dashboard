<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { FileSearchIcon, ScrollTextIcon, TerminalSquareIcon } from '@lucide/svelte';
	import Box from '@lucide/svelte/icons/box';
	import Layers from '@lucide/svelte/icons/layers';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CephRookIoV1CephObjectStore, CoreV1Pod, CoreV1Service } from '@otterscale/types';
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

	let { object }: { object: CephRookIoV1CephObjectStore } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(object?.metadata?.namespace ?? '');
	const objectStoreName = $derived(object?.metadata?.name ?? '');

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

		if (!cluster || !namespace || !objectStoreName) {
			return;
		}

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: object?.status?.selector
			});

			pods = response.items.map((item) => item.object as CoreV1Pod);
		} catch (error) {
			console.error(`Failed to fetch pods for object store ${objectStoreName}:`, error);
		}
	}

	let relatedResources = $state({});

	async function fetchRelatedResources() {
		if (!cluster || !namespace || !objectStoreName) {
			return;
		}

		try {
			const serviceResponse = await resourceClient.get({
				cluster: cluster,
				name: `rook-ceph-rgw-${object?.metadata?.name}-external`,
				namespace: object?.metadata?.namespace,
				group: '',
				version: 'v1',
				resource: 'services'
			});

			lodash.set(relatedResources, 'Service', serviceResponse.object as CoreV1Service);
		} catch (error) {
			console.error(`Failed to fetch pods for object store ${objectStoreName}:`, error);
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
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<Layers size={20} />
						</Item.Media>
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Service</Item.Title>
						</Item.Content>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{@const summaries = [
					{ name: 'Name', information: object?.metadata?.name },
					{ name: 'Namespace', information: object?.metadata?.namespace },
					{ name: 'Phase', information: object?.status?.phase },
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
					{#if kind === 'Service'}
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
						There are no related resources to display for this object store.
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
					<Empty.Description>No pods matched the selector for this object store.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Field.Set>
</Field.Group>
