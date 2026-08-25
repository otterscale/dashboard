<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import Ban from '@lucide/svelte/icons/ban';
	import Layers from '@lucide/svelte/icons/layers';
	import {
		type GetRequest,
		ResourceService,
		type SchemaRequest,
		WatchEvent_Type,
		type WatchRequest
	} from '@otterscale/api/resource/v1';
	import type { Schema } from '@sjsf/form';
	import { getContext, onDestroy, onMount } from 'svelte';

	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	import type { ViewerType as ResourceViewerType } from './actions';
	import { getResourceViewer } from './actions';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		name
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		name: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	type ResourceObject = {
		kind?: string;
		apiVersion?: string;
		metadata?: {
			name?: string;
			namespace?: string;
			creationTimestamp?: string;
			generation?: number;
			resourceVersion?: string;
			labels?: Record<string, string>;
			annotations?: Record<string, string>;
		};
	} & JsonObject;
	type ViewerError = { name?: string; rawMessage?: string; message?: string };

	let schema: Schema | undefined = $state(undefined);
	let object: ResourceObject | undefined = $state(undefined);
	let error: ViewerError | null = $state(null);

	let isGetting = $state(false);
	let getAbortController: AbortController | null = null;
	async function GetResource() {
		if (isGetting || isDestroyed) return;

		isGetting = true;
		getAbortController = new AbortController();

		try {
			const schemaResponse = await resourceClient.schema(
				{
					cluster,
					group,
					version,
					kind
				} as SchemaRequest,
				{ signal: getAbortController?.signal }
			);

			schema = schemaResponse.schema ?? {};

			const getResponse = await resourceClient.get(
				{
					cluster,
					namespace,
					group,
					version,
					resource,
					name
				} as GetRequest,
				{ signal: getAbortController?.signal }
			);
			object = getResponse.object;
		} catch (e) {
			error = e as Error;
		} finally {
			isGetting = false;
			if (getAbortController) getAbortController = null;
		}
	}

	let isWatching = $state(false);
	let watchAbortController: AbortController | null = null;

	async function watchResource() {
		if (isWatching || isDestroyed) return;

		const resourceVersion = object?.metadata?.resourceVersion;
		if (!resourceVersion) return;

		isWatching = true;
		watchAbortController = new AbortController();

		try {
			const stream = resourceClient.watch(
				{
					cluster,
					namespace,
					group,
					version,
					resource,
					fieldSelector: `metadata.name=${name}`,
					resourceVersion
				} as WatchRequest,
				{ signal: watchAbortController.signal }
			);

			for await (const event of stream) {
				// eslint-disable-next-line
				const response: any = event;

				if (response.type === WatchEvent_Type.ERROR) {
					continue;
				}

				if (response.type === WatchEvent_Type.BOOKMARK) {
					continue;
				}

				if (response.type === WatchEvent_Type.MODIFIED) {
					object = response.resource?.object;
				} else if (response.type === WatchEvent_Type.DELETED) {
					error = { name: 'Resource Deleted', rawMessage: `${kind} "${name}" has been deleted.` };
				}
			}
		} catch (e) {
			if (watchAbortController?.signal.aborted) return;
			console.error('Watch stream ended:', e);
		} finally {
			isWatching = false;
			watchAbortController = null;

			// Reconnect if not destroyed
			if (!isDestroyed) {
				await sleep(2000);
				await GetResource();
				await watchResource();
			}
		}
	}

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	let isMounted = $state(false);
	onMount(async () => {
		await GetResource();
		isMounted = true;
		watchResource();
	});

	let isDestroyed = $state(false);
	onDestroy(() => {
		isDestroyed = true;

		if (getAbortController) {
			getAbortController.abort();
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}
	});
</script>

{#if !isMounted}
	<Field.Group class="pb-8">
		<Field.Set>
			<Item.Root>
				<Item.Media>
					<Skeleton class="size-10" />
				</Item.Media>
				<Item.Content>
					<Item.Description>
						<Skeleton class="h-7 w-1/6" />
					</Item.Description>
					<Item.Title>
						<Skeleton class="h-5 w-[10vw]" />
					</Item.Title>
					<div class="grid grid-cols-3">
						{#each Array(3)}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Description>
										<Skeleton class="h-5 w-1/6" />
									</Item.Description>
									<Item.Title>
										<Skeleton class="h-3 w-[10vw]" />
									</Item.Title>
								</Item.Content>
							</Item.Root>
						{/each}
					</div>
				</Item.Content>
				<Item.Actions>
					<Skeleton class="size-10" />
				</Item.Actions>
			</Item.Root>
		</Field.Set>
		<Field.Set>
			{#each Array(13).keys() as index (index)}
				<Skeleton class="h-5 w-full" />
			{/each}
		</Field.Set>
	</Field.Group>
{:else if error}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media class="rounded-full bg-muted p-4">
				<Ban size={36} />
			</Empty.Media>
			<Empty.Title class="text-2xl font-bold">Failed to load data</Empty.Title>
			<Empty.Description>
				An error occurred while fetching data. Please check your connection or try again later.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Alert.Root variant="destructive" class="border-none bg-destructive/5">
				<Alert.Title class="font-bold">{error?.name}</Alert.Title>
				<Alert.Description class="text-start">
					{error?.rawMessage}
				</Alert.Description>
			</Alert.Root>
			<div class="flex gap-4">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button href="/">Go Home</Button>
			</div>
		</Empty.Content>
	</Empty.Root>
{:else}
	<Field.Group class="pb-8">
		<Field.Set>
			<!-- Header -->
			<Item.Root class="w-full p-0">
				<Item.Media variant="image" class="bg-muted-foreground/50 p-2">
					<Layers />
				</Item.Media>
				<Item.Content>
					<Item.Description>
						{object?.kind}
					</Item.Description>
					<Item.Title class="text-xl font-bold">
						{object?.metadata?.name}
					</Item.Title>
				</Item.Content>
			</Item.Root>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
				{#if object?.metadata}
					{@const Metadatacluster = { key: 'Cluster', value: cluster }}
					{@const MetadataNamespace = {
						key: 'Namespace',
						value: namespace
					}}
					{@const MetadataCreationTimestamp = {
						key: 'Creation Timestamp',
						value: object.metadata?.creationTimestamp
							? new Date(object.metadata?.creationTimestamp).toLocaleString('sv-SE')
							: ''
					}}
					{@const MetadataGeneration = {
						key: 'Generation',
						value: object.metadata?.generation
					}}
					{@const MetadataResourceVersion = {
						key: 'Resource Version',
						value: object.metadata?.resourceVersion
					}}
					{#each [Metadatacluster, MetadataNamespace, MetadataCreationTimestamp, MetadataGeneration, MetadataResourceVersion].filter((metadata) => metadata.value) as metadata, index (index)}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Description>
									{metadata.key}
								</Item.Description>
								<Item.Title>
									{metadata.value}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				{/if}
			</div>
		</Field.Set>
		{#if object}
			{@const ResourceViewer: ResourceViewerType = getResourceViewer(resource)}
			<ResourceViewer {object} {schema} />
		{/if}
	</Field.Group>
{/if}
