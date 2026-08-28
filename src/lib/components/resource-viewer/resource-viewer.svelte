<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ListIcon } from '@lucide/svelte';
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
	import lodash from 'lodash';
	import { getContext, onDestroy, onMount } from 'svelte';

	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { cn } from '$lib/utils';

	import Conditions from './related-inforamtion/conditions.svelte';
	import Yaml from './related-inforamtion/data.svelte';
	import Events from './related-inforamtion/evens.svelte';
	import RelatedResources from './related-inforamtion/related-resources.svelte';
	import type { Resource } from './types';

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

	const EVENT_UNSUPPORTED_KINDS = new Set([
		'ClusterRoleBinding',
		'ClusterRole',
		'LimitRange',
		'Namespace',
		'NetworkPolicy',
		'ResourceQuota',
		'RoleBinding',
		'Role',
		'Secret'
	]);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let schema: Schema | undefined = $state(undefined);
	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster,
				group,
				version,
				kind
			} as SchemaRequest);
			return schemaResponse.schema as Schema;
		} catch (e) {
			console.error('Failed to fetch schema:', e);
			return undefined;
		}
	}

	let object: Resource | undefined = $state(undefined);
	let error: { name: string; rawMessage: string } | Error | null = $state(null);
	let isGetting = $state(false);
	let getAbortController: AbortController | null = null;
	async function GetResource() {
		if (isGetting || isDestroyed) return;

		isGetting = true;
		getAbortController = new AbortController();

		try {
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
			object = getResponse.object as Resource | undefined;
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

	const hasConditions = $derived(!!lodash.get(schema, 'properties.status.properties.conditions'));
	const hasEvents = $derived(!EVENT_UNSUPPORTED_KINDS.has(kind));

	let selectedRelatedInformation = $state({
		value: 'related-resource',
		label: 'Related Resources'
	});
	const relatedInformations = $derived(
		[
			{ value: 'data', label: 'Data' },
			hasConditions ? { value: 'condition', label: 'Conditions' } : null,
			hasEvents ? { value: 'event', label: 'Recent Events' } : null,
			{ value: 'related-resource', label: 'Related Resources' }
		].filter(Boolean)
	);

	let isMounted = $state(false);
	onMount(async () => {
		const [, fetchedSchema] = await Promise.all([GetResource(), fetchSchema()]);
		schema = fetchedSchema;
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
					{lodash.get(error, 'rawMessage')}
				</Alert.Description>
			</Alert.Root>
			<div class="flex gap-4">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button href="/">Go Home</Button>
			</div>
		</Empty.Content>
	</Empty.Root>
{:else if object}
	<Field.Group class="space-y-4 pb-8">
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
				<Item.Actions>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost">
									<ListIcon />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-fit">
							<DropdownMenu.Group>
								{#each relatedInformations as relatedInformation (relatedInformation.value)}
									<DropdownMenu.Item
										onSelect={() => {
											selectedRelatedInformation = relatedInformation;
										}}
									>
										{relatedInformation.label}
									</DropdownMenu.Item>
								{/each}
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Item.Actions>
			</Item.Root>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
				{#if object?.metadata}
					{@const Metadatacluster = { key: 'Cluster', value: cluster, data: cluster }}
					{@const MetadataNamespace = {
						key: 'Namespace',
						value: namespace,
						data: namespace
					}}
					{@const MetadataCreationTimestamp = {
						key: 'Creation Timestamp',
						value: object.metadata?.creationTimestamp
							? new Date(object.metadata?.creationTimestamp).toLocaleString('sv-SE')
							: '',
						data: object.metadata?.creationTimestamp
					}}
					{@const MetadataGeneration = {
						key: 'Generation',
						value: object.metadata?.generation,
						data: object.metadata?.generation
					}}
					{@const MetadataLabels = {
						key: 'Labels' as const,
						value: Object.keys(object.metadata?.labels ?? {}).length,
						data: object.metadata?.labels
					}}
					{@const MetadataAnnotations = {
						key: 'Annotations' as const,
						value: Object.keys(object.metadata?.annotations ?? {}).length,
						data: object.metadata?.annotations
					}}
					{#each [Metadatacluster, MetadataNamespace, MetadataCreationTimestamp, MetadataGeneration, MetadataLabels, MetadataAnnotations].filter((metadata) => metadata.value) as metadata, index (index)}
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
		<Field.Set>
			<Tabs.Root value={selectedRelatedInformation.value} class="w-full">
				<Tabs.Content value="data">
					<Yaml {object} />
				</Tabs.Content>
				{#if hasConditions}
					<Tabs.Content value="condition">
						<Conditions {object} />
					</Tabs.Content>
				{/if}
				{#if hasEvents}
					<Tabs.Content value="event">
						<Events {cluster} {namespace} {kind} {name} />
					</Tabs.Content>
				{/if}
				<Tabs.Content value="related-resource">
					<RelatedResources
						{cluster}
						{namespace}
						{group}
						{version}
						{kind}
						{resource}
						{name}
						{object}
					/>
				</Tabs.Content>
			</Tabs.Root>
		</Field.Set>
	</Field.Group>
{/if}
