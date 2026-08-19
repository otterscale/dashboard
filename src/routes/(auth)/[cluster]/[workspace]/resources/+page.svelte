<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BanIcon from '@lucide/svelte/icons/ban';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import {
		type APIResource,
		type DiscoveryRequest,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import KindViewer from '$lib/components/kind-viewer/kind-viewer.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import Label from '$lib/components/ui/label/label.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	type Identifier = {
		group: string;
		version: string;
		resource: string;
	};

	const shortcuts: { label: string; identifier: Identifier }[] = [
		{ label: 'Pod', identifier: { resource: 'pods', group: '', version: 'v1' } },
		{ label: 'Job', identifier: { resource: 'jobs', group: 'batch', version: 'v1' } },
		{ label: 'Deployment', identifier: { resource: 'deployments', group: 'apps', version: 'v1' } },
		{ label: 'DaemonSet', identifier: { resource: 'daemonsets', group: 'apps', version: 'v1' } },
		{
			label: 'Persistent Volume Claim',
			identifier: { resource: 'persistentvolumeclaims', group: '', version: 'v1' }
		},
		{
			label: 'Storage Class',
			identifier: { resource: 'storageclasses', group: 'storage.k8s.io', version: 'v1' }
		},
		{
			label: 'Gateway',
			identifier: { resource: 'gateways', group: 'gateway.networking.k8s.io', version: 'v1' }
		},
		{ label: 'Service', identifier: { resource: 'services', group: '', version: 'v1' } }
	];

	function getAPIResourceByGroupVersionResource(
		apiResources: APIResource[],
		identifier: {
			group: string;
			version: string;
			resource: string;
		}
	): APIResource | undefined {
		return apiResources.find(
			(apiResource) =>
				(apiResource.group || 'core') === (identifier.group || 'core') &&
				apiResource.version === identifier.version &&
				apiResource.resource === identifier.resource
		);
	}

	const cluster = $derived(page.params.cluster ?? '');

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	let apiResources = $state<APIResource[]>([]);
	let groupedMainAPIResources = $state<Record<string, APIResource[]>>({});
	let isLoaded = $state(false);
	let hasError = $state(false);
	let loadError = $state<any>(undefined);

	let selectedAPIResource = $state<APIResource | undefined>(undefined);

	async function fetchAPIResources(cluster: string) {
		const response = await client.discovery({ cluster } as DiscoveryRequest);
		const raw: APIResource[] = response.apiResources;
		const main = raw.filter((apiResource) => !apiResource.resource.includes('/'));
		const grouped = lodash.groupBy(main, (apiResource) => apiResource.group || 'core');
		return { raw: raw, grouped: grouped };
	}

	onMount(async () => {
		try {
			const { raw, grouped } = await fetchAPIResources(cluster);

			apiResources = raw;
			groupedMainAPIResources = grouped;

			const matchedAPIResource = getAPIResourceByGroupVersionResource(raw, {
				resource: 'pods',
				group: '',
				version: 'v1'
			});
			if (matchedAPIResource) {
				selectedAPIResource = matchedAPIResource;
			}
		} catch (error) {
			hasError = true;
			loadError = error;
		} finally {
			isLoaded = true;
		}
	});
</script>

{#if !isLoaded}
	<div class="flex flex-col gap-4 pt-1">
		<Skeleton class="h-6 w-32" />
		<Skeleton class="h-4 w-64" />
		<Skeleton class="h-8 w-full" />
		<Skeleton class="h-144 w-full" />
		<div class="flex items-center justify-between">
			<Skeleton class="h-8 w-36" />
			<div class="flex items-center gap-4">
				<Skeleton class="h-8 w-24" />
				<Skeleton class="h-8 w-48" />
			</div>
		</div>
	</div>
{:else if hasError}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media class="rounded-full bg-muted p-4">
				<BanIcon class="size-8" />
			</Empty.Media>
			<Empty.Title class="text-2xl font-bold">Failed to load data</Empty.Title>
			<Empty.Description>
				An error occurred while fetching data. Please check your connection or try again later.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Alert.Root variant="destructive" class="border-none bg-destructive/5">
				<Alert.Title class="font-bold">{loadError?.name}</Alert.Title>
				<Alert.Description class="text-start">
					{loadError?.rawMessage}
				</Alert.Description>
			</Alert.Root>
			<div class="flex gap-4">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button href="/">Go Home</Button>
			</div>
		</Empty.Content>
	</Empty.Root>
{:else}
	<div class="space-y-4">
		<div class="flex items-end justify-between gap-4">
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">
						{selectedAPIResource?.kind}
					</Item.Title>
					<Item.Description class="text-base">
						{selectedAPIResource?.group || 'core'}/{selectedAPIResource?.version}
					</Item.Description>
				</Item.Content>
				<Item.Actions>
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" class="justify-between">
									<ChevronsUpDownIcon class="opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content
							class="grid max-h-96 w-full min-w-2xl grid-cols-[0.6fr_0_1fr] p-2"
							align="end"
						>
							<Command.Root class="flex h-full min-w-0 flex-col items-center">
								<Label class="p-2 text-xs text-muted-foreground">Shortcuts</Label>
								<Command.List>
									<Command.Group>
										{#each shortcuts as shortcut, index (index)}
											<Command.Item
												value={`${shortcut.identifier.group}/${shortcut.identifier.version}/${shortcut.identifier.resource}`}
												onSelect={() =>
													(selectedAPIResource = getAPIResourceByGroupVersionResource(
														apiResources,
														shortcut.identifier
													))}
											>
												<Item.Root class="p-0" size="sm">
													<Item.Content>
														<Item.Title>{shortcut.label}</Item.Title>
														<Item.Description>
															{shortcut.identifier.group || 'core'}
														</Item.Description>
													</Item.Content>
												</Item.Root>
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
							<Separator orientation="vertical" />
							<Command.Root class="min-w-0">
								<Command.Input placeholder="Search resource..." />
								<Command.List class="h-full overflow-y-auto">
									<Command.Empty>No resource found.</Command.Empty>
									{#each Object.entries(groupedMainAPIResources) as [group, apiResources] (group)}
										<Command.Group heading={group}>
											{#each apiResources as apiResource, index (index)}
												<Command.Item
													value={`${apiResource.group}/${apiResource.version}/${apiResource.resource}`}
													onSelect={() => {
														selectedAPIResource = apiResource;
													}}
												>
													<Item.Root class="w-full p-0">
														<Item.Content>
															<Item.Title>{apiResource.resource}</Item.Title>
														</Item.Content>
														<Item.Actions
															class="shrink-0 text-xs text-muted-foreground tabular-nums"
														>
															{apiResource.version}
														</Item.Actions>
													</Item.Root>
												</Command.Item>
											{/each}
										</Command.Group>
									{/each}
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</Item.Actions>
			</Item.Root>
		</div>
		{#if selectedAPIResource}
			{#key `${selectedAPIResource.group}/${selectedAPIResource.version}/${selectedAPIResource.resource}`}
				<KindViewer isClusterAdmin={true} {cluster} apiResource={selectedAPIResource} />
			{/key}
		{/if}
	</div>
{/if}
