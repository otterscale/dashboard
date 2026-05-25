<script lang="ts">
	import type { JsonObject, JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Columns3Icon, EllipsisIcon, EraserIcon } from '@lucide/svelte';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CableIcon from '@lucide/svelte/icons/cable';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import UsersRoundIcon from '@lucide/svelte/icons/users-round';
	import {
		type APIResource,
		type ListRequest,
		ResourceService,
		type SchemaRequest,
		WatchEvent_Type,
		type WatchRequest
	} from '@otterscale/api/resource/v1';
	import type { Schema } from '@sjsf/form';
	import type { ColumnDef, Table as TableType } from '@tanstack/table-core';
	import Ajv, { type ValidateFunction } from 'ajv';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import type { DataSchemaType, UISchemaType } from '../dynamic-table/utils';
	import type { ActionsType, CreateType } from './kind-viewer-actions';
	import { getActions, getCreate } from './kind-viewer-actions';
	import {
		getColumnDefinitions,
		getData,
		getDataSchemas,
		getUISchemas
	} from './kind-viewer-columns';
	import { getGridLayout, type GridLayoutType } from './kind-viewer-grid-layouts';

	let {
		isClusterAdmin,
		cluster,
		namespace: namespaceProp,
		apiResource,
		labelSelector = '',
		fieldSelector = ''
	}: {
		isClusterAdmin: boolean;
		cluster: string;
		namespace?: string;
		apiResource: APIResource;
		labelSelector?: string;
		fieldSelector?: string;
	} = $props();

	let clustered = $derived(isClusterAdmin);

	let schema: Schema | undefined = $state(undefined);
	let validate: ValidateFunction | undefined = $state(undefined);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const uiSchemas: Record<string, UISchemaType> = $derived(getUISchemas(apiResource.kind));
	const dataSchemas: Record<string, DataSchemaType> = $derived(getDataSchemas(apiResource.kind));
	const namespace = $derived.by(() => {
		return apiResource.namespaced ? namespaceProp : undefined;
	});

	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster: cluster,
				group: apiResource.group,
				version: apiResource.version,
				kind: apiResource.kind
			} as SchemaRequest);

			return schemaResponse.schema as Schema;
		} catch (error) {
			console.error('Failed to fetch schema:', error);
			return undefined;
		}
	}

	const jsonSchemaValidator = new Ajv({ allErrors: true, strict: false, logger: false });
	function getValidate(schema: Schema) {
		return jsonSchemaValidator.compile($state.snapshot(schema));
	}

	let fetchError: Error | null = $state(null);
	const dataset = new SvelteMap<string, Record<string, JsonValue>>();
	const data = $derived(Array.from(dataset.values()));
	function getKey(datum: Record<string, JsonValue>): string {
		return apiResource.namespaced ? `${datum['Namespace']}/${datum['Name']}` : `${datum['Name']}`;
	}
	let columnDefinitions: ColumnDef<Record<string, JsonValue>>[] | undefined = $state(undefined);

	let listAbortController: AbortController | null = null;
	let watchAbortController: AbortController | null = null;

	let resourceVersion: string | undefined = $state(undefined);

	let isListing = $state(false);
	let isMounted = $state(false);
	async function listResources() {
		if (isListing || isWatching || isDestroyed) return;

		isListing = true;
		listAbortController = new AbortController();
		try {
			let continueToken: string | undefined = undefined;
			do {
				const response = await resourceClient.list(
					{
						cluster: cluster,
						namespace: !clustered ? namespace : undefined,
						group: apiResource.group,
						version: apiResource.version,
						resource: apiResource.resource,
						labelSelector,
						fieldSelector,
						limit: BigInt(10),
						continue: continueToken
					} as ListRequest,
					{ signal: listAbortController.signal }
				);

				resourceVersion = response.resourceVersion;
				continueToken = response.continue;

				for (const item of response.items) {
					if (item.object) {
						const data = getData(apiResource, item.object);
						dataset.set(getKey(data), data);
					}
				}

				isMounted = true;

				if (listAbortController.signal.aborted) {
					break;
				}
			} while (continueToken);
		} catch (err) {
			if (listAbortController.signal.aborted) return;

			console.error('Failed to list resources:', err);
			fetchError = err instanceof Error ? err : new Error(String(err));

			return null;
		} finally {
			isListing = false;
			listAbortController = null;
		}
	}

	let isWatching = $state(false);
	async function watchResources() {
		if (isListing || isWatching || isDestroyed) return;

		isWatching = true;
		watchAbortController = new AbortController();
		try {
			const watchResourcesStream = resourceClient.watch(
				{
					cluster: cluster,
					namespace: !clustered ? namespace : undefined,
					group: apiResource.group,
					version: apiResource.version,
					resource: apiResource.resource,
					labelSelector,
					fieldSelector,
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
					const addedData = getData(apiResource, response.resource?.object);
					dataset.set(getKey(addedData), addedData);
				} else if (response.type === WatchEvent_Type.MODIFIED) {
					const modifiedData = getData(apiResource, response.resource?.object);
					dataset.set(getKey(modifiedData), modifiedData);
				} else if (response.type === WatchEvent_Type.DELETED) {
					const deletedData = getData(apiResource, response.resource?.object);
					dataset.delete(getKey(deletedData));
				} else {
					console.error('Unknown response type: ', response);
				}
			}
		} catch (error) {
			if (watchAbortController.signal.aborted) return;

			console.error('Failed to watch resources:', error);
		} finally {
			if (!isDestroyed) {
				toast.info(`Watching resource ${namespace} ${apiResource.resource} was cancelled.`);
			}

			isWatching = false;
			watchAbortController = null;
		}
	}

	const sleep = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms));

	async function resetAndReload() {
		if (listAbortController) {
			listAbortController.abort();
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}

		dataset.clear();
		resourceVersion = undefined;
		fetchError = null;
		isListing = false;
		isWatching = false;

		await sleep(500); // for smooth transition

		await listResources();
		watchResources();
	}

	onMount(async () => {
		// For Dynamic Table
		columnDefinitions = getColumnDefinitions(apiResource, uiSchemas, dataSchemas, cluster);
		await listResources();
		watchResources();
		// For Dynamic Form
		schema = await fetchSchema();
		if (schema) {
			validate = getValidate(schema);
		}
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
		if (!isWatching) {
			watchResources();
			return;
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}
	}

	const Create: CreateType = $derived(getCreate(apiResource.kind, namespace));
	const Actions: ActionsType = $derived(getActions(apiResource.kind, namespace));
	const GridLayout: GridLayoutType = $derived(getGridLayout(apiResource.kind, namespace));
</script>

{#snippet gridLayout({
	table,
	handleClear
}: {
	table: TableType<Record<string, JsonValue>>;
	handleClear: () => void;
})}
	{#if GridLayout && schema && validate}
		{#if table.getRowModel().rows?.length}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each table.getRowModel().rows as row (row.id)}
					<GridLayout
						{row}
						{cluster}
						namespace={namespace ?? ''}
						group={apiResource.group}
						version={apiResource.version}
						kind={apiResource.kind}
						resource={apiResource.resource}
						{schema}
						{validate}
					/>
				{/each}
			</div>
		{:else}
			<Empty.Root class="rounded-lg bg-muted">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Columns3Icon size={32} class="opacity-60" aria-hidden="true" />
					</Empty.Media>
					<Empty.Title>No Resources Found</Empty.Title>
					<Empty.Description>
						No resources found. Please adjust your filters or initiate a new resource to populate
						this table.
					</Empty.Description>
				</Empty.Header>
				<Empty.Content>
					<Button onclick={handleClear}>
						<EraserIcon size={16} class="opacity-60" />
						Reset
					</Button>
				</Empty.Content>
			</Empty.Root>
		{/if}
	{/if}
{/snippet}

{#if fetchError}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media class="rounded-full bg-muted p-4">
				<BanIcon size={36} />
			</Empty.Media>
			<Empty.Title class="text-2xl font-bold">Failed to load data</Empty.Title>
			<Empty.Description>
				{fetchError.message}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button onclick={resetAndReload}>Retry</Button>
		</Empty.Content>
	</Empty.Root>
{:else if isMounted}
	{#if columnDefinitions}
		<DynamicTable
			{data}
			{columnDefinitions}
			{uiSchemas}
			gridLayout={GridLayout ? gridLayout : undefined}
		>
			{#snippet accessReview()}
				{#if isClusterAdmin}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Toggle
									{...props}
									bind:pressed={clustered}
									onPressedChange={(pressed) => {
										clustered = pressed;
										resetAndReload();
									}}
									aria-label="switch clustered"
									variant="outline"
									class="data-[state=on]:*:text-destructive"
								>
									<UsersRoundIcon class="size-4" />
								</Toggle>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Toggle Cluster-wide View</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			{/snippet}
			{#snippet create()}
				{#if schema}
					<Create
						role={isClusterAdmin ? 'Cluster Admin' : undefined}
						{schema}
						{validate}
						{cluster}
						{namespace}
						group={apiResource.group}
						version={apiResource.version}
						kind={apiResource.kind}
						resource={apiResource.resource}
					/>
				{:else}
					<Button variant="outline" size="icon" disabled>
						<PlusIcon />
					</Button>
				{/if}
			{/snippet}
			{#snippet reload()}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button {...props} onclick={handleReload} variant="outline" size="icon">
								{#if isWatching}
									<CableIcon class="size-4" />
								{:else}
									<UnplugIcon class="size-4 text-destructive" />
								{/if}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{isWatching ? 'Watching' : 'Reconnect'}</Tooltip.Content>
				</Tooltip.Root>
			{/snippet}
			{#snippet rowActions({ row })}
				{#if schema}
					<Actions
						role={isClusterAdmin ? 'Cluster Admin' : undefined}
						{row}
						object={row.original.raw as JsonObject | undefined}
						{schema}
						{validate}
						{cluster}
						namespace={namespace
							? (row.original.raw as Record<string, Record<string, string>>)?.metadata?.namespace ||
								namespace
							: namespace}
						group={apiResource.group}
						version={apiResource.version}
						kind={apiResource.kind}
						resource={apiResource.resource}
					/>
				{:else}
					<div class="flex justify-end">
						<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" disabled>
							<EllipsisIcon size={16} aria-hidden="true" />
						</Button>
					</div>
				{/if}
			{/snippet}
		</DynamicTable>
	{/if}
{/if}
