<script lang="ts">
	import { type JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Ban, Cable, Unplug } from '@lucide/svelte';
	import {
		type APIResource,
		type ListRequest,
		ResourceService,
		type SchemaRequest,
		WatchEvent_Type,
		type WatchRequest
	} from '@otterscale/api/resource/v1';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	import type { DataSchemaType, UISchemaType } from '../dynamic-table/utils';
	import type { ActionsType, CreateType } from './kind-viewer-actions';
	import { getActions, getCreate } from './kind-viewer-actions';
	import { getColumnDefinitions, getData, getDataSchemas, getUISchemas } from './kind-viewers';

	let {
		clustered,
		apiResource,
		cluster,
		group,
		version,
		kind,
		resource,
		namespace
	}: {
		clustered: boolean;
		apiResource?: APIResource;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespace?: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// eslint-disable-next-line
	let schema: any = $state({});

	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster: cluster,
				group: group,
				version: version,
				kind: kind
			} as SchemaRequest);

			schema = schemaResponse.schema ?? {};
		} catch (error) {
			console.error('Failed to fetch schema:', error);
			return null;
		}
	}

	let dataset: Record<string, JsonValue>[] = $state([]);
	let datasetError: any = $state(undefined);

	let listAbortController: AbortController | null = null;
	let watchAbortController: AbortController | null = null;

	let resourceVersion: string | undefined = $state(undefined);

	// loading flags to manage UI state and avoid flicker
	let isListing = $state(false);
	async function listResources(apiResource: APIResource) {
		if (isListing || isWatching || isDestroyed) return;

		isListing = true;
		listAbortController = new AbortController();
		try {
			let continueToken: string | undefined = undefined;
			do {
				const response = await resourceClient.list(
					{
						cluster: cluster,
						namespace: clustered ? undefined : apiResource.namespaced ? namespace : undefined,
						group: group,
						version: version,
						resource: resource,
						limit: BigInt(10),
						continue: continueToken
					} as ListRequest,
					{ signal: listAbortController.signal }
				);

				resourceVersion = response.resourceVersion;
				continueToken = response.continue;

				const newData = response.items.map((item) => getData(kind, apiResource, item.object));
				dataset = [...dataset, ...newData];

				if (listAbortController.signal.aborted) {
					break;
				}
			} while (continueToken);
		} catch (error) {
			if (listAbortController.signal.aborted) return;

			console.error('Failed to list resources:', error);

			datasetError = error;

			return null;
		} finally {
			isListing = false;
			listAbortController = null;
		}
	}

	let isWatching = $state(false);
	async function watchResources(apiResource: APIResource) {
		if (isListing || isWatching || isDestroyed) return;

		isWatching = true;
		watchAbortController = new AbortController();
		try {
			const watchResourcesStream = resourceClient.watch(
				{
					cluster: cluster,
					namespace: clustered ? undefined : apiResource.namespaced ? namespace : undefined,
					group: group,
					version: version,
					resource: resource,
					resourceVersion: resourceVersion
				} as WatchRequest,
				{ signal: watchAbortController.signal }
			);

			for await (const watchResourcesResponse of watchResourcesStream) {
				// eslint-disable-next-line
				const response: any = watchResourcesResponse;

				if (response.type === WatchEvent_Type.ERROR) {
					continue;
				}

				if (response.type === WatchEvent_Type.BOOKMARK) {
					resourceVersion = response.resourceVersion as string;
					continue;
				}

				resourceVersion = response.resource?.object?.metadata?.resourceVersion;

				if (response.type === WatchEvent_Type.ADDED) {
					const addedData = getData(kind, apiResource, response.resource?.object);

					const index = dataset.findIndex((object) => {
						if (apiResource.namespaced) {
							return object.Namespace === addedData.Namespace && object.Name === addedData.Name;
						} else {
							return object.Name === addedData.Name;
						}
					});

					if (index < 0) {
						dataset = [...dataset, addedData];
					}
				} else if (response.type === WatchEvent_Type.MODIFIED) {
					const modifiedData = getData(kind, apiResource, response.resource?.object);

					dataset = dataset.map((object) => {
						if (
							apiResource.namespaced &&
							object.Namespace === modifiedData.Namespace &&
							object.Name === modifiedData.Name
						) {
							return modifiedData;
						} else if (!apiResource.namespaced && object.Name === modifiedData.Name) {
							return modifiedData;
						}

						return object;
					});
				} else if (response.type === WatchEvent_Type.DELETED) {
					const deletedData = getData(kind, apiResource, response.resource?.object);
					dataset = dataset.filter((object) => {
						if (apiResource.namespaced) {
							return object.Namespace === deletedData.Namespace && object.Name !== deletedData.Name;
						} else {
							return object.Name !== deletedData.Name;
						}
					});
				} else {
					console.log('Unknown response type: ', response);
				}
			}
		} catch (error) {
			if (watchAbortController.signal.aborted) return;

			console.error('Failed to watch resources:', error);

			datasetError = error;
		} finally {
			toast.info(`Watching resource ${namespace} ${resource} was cancelled.`);

			isWatching = false;
			watchAbortController = null;
		}
	}

	let isMounted: boolean | undefined = $state(undefined);
	onMount(async () => {
		if (!apiResource) {
			isMounted = true;
			return;
		}

		await fetchSchema();
		await listResources(apiResource);
		watchResources(apiResource);
		isMounted = true;
	});

	let isDestroyed = false;
	onDestroy(() => {
		isDestroyed = true;

		if (listAbortController) {
			listAbortController.abort();
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}
	});

	function handleReload() {
		if (!apiResource) return;

		if (!isWatching) {
			watchResources(apiResource);
		}
	}

	const Create: CreateType = $derived(getCreate(kind));
	const Actions: ActionsType = $derived(getActions(kind));
</script>

{#if apiResource}
	{#if isMounted === undefined}
		<div class="space-y-4">
			<div class="space-y-4">
				<Skeleton class="h-13 w-1/3" />
				<Skeleton class="h-7 w-1/5" />
			</div>
			<div class="flex items-center gap-2">
				<Skeleton class="h-7 w-full" />
				{#each Array(3)}
					<Skeleton class="size-7" />
				{/each}
			</div>
			<div class="rounded-lg border">
				<Table.Root class="w-full">
					<Table.Header>
						<Table.Row>
							{#each Array(5)}
								<Table.Head class="p-4">
									<Skeleton class="h-7 w-full" />
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each Array(7)}
							<Table.Row class="border-none">
								{#each Array(5)}
									<Table.Cell>
										<Skeleton class="h-7 w-full" />
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<div class="flex items-center justify-between gap-4">
				<Skeleton class="h-7 w-1/5" />
				<div class="flex items-center gap-2">
					{#each Array(3)}
						<Skeleton class="size-10" />
					{/each}
				</div>
			</div>
		</div>
	{:else if isMounted === false}
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
					<Alert.Title class="font-bold">{datasetError?.name}</Alert.Title>
					<Alert.Description class="text-start">
						{datasetError?.rawMessage}
					</Alert.Description>
				</Alert.Root>
				<div class="flex gap-4">
					<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
					<Button href="/">Go Home</Button>
				</div>
			</Empty.Content>
		</Empty.Root>
	{:else if isMounted === true}
		{@const uiSchemas: Record<string, UISchemaType> = getUISchemas(kind)}
		{@const dataSchemas: Record<string, DataSchemaType> = getDataSchemas(kind)}
		{@const columnDefinitions = getColumnDefinitions(kind, apiResource, uiSchemas, dataSchemas)}
		{#if columnDefinitions}
			<DynamicTable {dataset} {columnDefinitions} {uiSchemas} {dataSchemas}>
				{#snippet create()}
					<Create {schema} {cluster} {group} {version} {kind} {resource} />
				{/snippet}
				{#snippet reload()}
					<Button onclick={handleReload} disabled={isWatching} variant="outline">
						{#if isWatching}
							<Cable class="opacity-60" size={16} />
						{:else}
							<Unplug class="text-destructive opacity-60" size={16} />
						{/if}
					</Button>
				{/snippet}
				{#snippet rowActions({ row })}
					<Actions
						{row}
						{schema}
						object={row.original.raw}
						{cluster}
						{group}
						{version}
						{kind}
						{resource}
					/>
				{/snippet}
			</DynamicTable>
		{/if}
	{/if}
{:else}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media class="rounded-full bg-muted p-4">
				<Ban size={36} />
			</Empty.Media>
			<Empty.Title class="text-2xl font-bold">Failed to fetch schema</Empty.Title>
			<Empty.Description>
				An error occurred while fetching schema. Please check your connection or try again later.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<div class="flex gap-4">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button href="/">Go Home</Button>
			</div>
		</Empty.Content>
	</Empty.Root>
{/if}
