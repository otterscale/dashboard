<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import Ban from '@lucide/svelte/icons/ban';
	import Layers from '@lucide/svelte/icons/layers';
	import {
		type GetRequest,
		type ListRequest,
		ResourceService,
		type SchemaRequest,
		WatchEvent_Type,
		type WatchRequest
	} from '@otterscale/api/resource/v1';
	import type { Schema } from '@sjsf/form';
	import { type ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	import RelatedInformationTable from './related-information-table.svelte';
	import { getRelatedResourcesGetter } from './related-resource-getters';
	import type { RelatedResource } from './types';

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

	// Kinds that never receive Kubernetes Events; there's no schema field to
	// detect this from, so it's hardcoded.
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

	let object: ResourceObject | undefined = $state(undefined);
	let error: ViewerError | null = $state(null);

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

	const showConditionTab = $derived(
		!!lodash.get(schema, 'properties.status.properties.conditions')
	);
	const showEventTab = $derived(!EVENT_UNSUPPORTED_KINDS.has(kind));

	function formatTimestamp(value: string): string {
		return value ? new Date(value).toLocaleString('sv-SE') : '—';
	}

	let isGetting = $state(false);
	let getAbortController: AbortController | null = null;
	async function GetResource() {
		console.log('get');
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

	function getResourceURL(target: {
		group: string;
		version: string;
		kind: string;
		resource: string;
		name: string;
		namespace?: string;
	}): string {
		const searchParameters = new URLSearchParams({
			group: target.group,
			version: target.version,
			kind: target.kind,
			resource: target.resource,
			...(target.namespace ? { namespace: target.namespace } : {}),
			query: `Name:${target.name}`
		});
		return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}?${searchParameters}`);
	}

	// --- Related resources tab ---

	function getRelatedResourceURL(relatedResource: RelatedResource): string {
		return getResourceURL(relatedResource);
	}

	const getRelatedResources = $derived(getRelatedResourcesGetter(resource));
	let relatedResources: RelatedResource[] = $state([]);
	// Re-run whenever the object changes — a watch event can add or drop a
	// relation — and drop whatever the previous run was still doing, so a slow
	// getter cannot resolve over a newer one.
	$effect(() => {
		const currentObject = object;
		if (!getRelatedResources || !currentObject) {
			relatedResources = [];
			return;
		}

		const abortController = new AbortController();
		(async () => {
			try {
				const resources = await getRelatedResources({
					cluster,
					group,
					version,
					kind,
					resource,
					namespace,
					name,
					object: currentObject,
					transport,
					signal: abortController.signal
				});
				if (abortController.signal.aborted) return;
				relatedResources = resources;
			} catch (e) {
				// A getter that fails should cost the section its links, not the page.
				if (abortController.signal.aborted) return;
				console.error('Failed to get related resources:', e);
				relatedResources = [];
			}
		})();

		return () => abortController.abort();
	});

	const relatedResourceColumns: ColumnDef<RelatedResource>[] = [
		{ accessorKey: 'group' },
		{ accessorKey: 'version' },
		{ accessorKey: 'resource' },
		{ accessorKey: 'name' },
		{ accessorKey: 'namespace' }
	];
	const sortedRelatedResources = $derived(
		lodash.sortBy(relatedResources, ['group', 'version', 'resource', 'namespace', 'name'])
	);
	function getRelatedResourceRowId(row: RelatedResource): string {
		return `${row.group}/${row.version}/${row.resource}/${row.namespace ?? ''}/${row.name}`;
	}

	// --- Event tab ---

	type EventRow = {
		key: string;
		name: string;
		type: string;
		reason: string;
		message: string;
		count: number;
		lastSeen: string;
	};

	let events: EventRow[] = $state([]);
	let isEventsLoading = $state(true);

	function getEventResourceURL(event: EventRow): string {
		return getResourceURL({
			group: '',
			version: 'v1',
			kind: 'Event',
			resource: 'events',
			name: event.name,
			namespace
		});
	}

	function toEventRow(eventObject: JsonObject, index: number): EventRow {
		return {
			key: (lodash.get(eventObject, 'metadata.uid') as string) ?? String(index),
			name: (lodash.get(eventObject, 'metadata.name') as string) ?? '',
			type: (lodash.get(eventObject, 'type') as string) ?? 'Normal',
			reason: (lodash.get(eventObject, 'reason') as string) ?? '—',
			message: (lodash.get(eventObject, 'message') as string) ?? '—',
			count:
				(lodash.get(eventObject, 'count') as number) ??
				(lodash.get(eventObject, 'series.count') as number) ??
				1,
			lastSeen:
				(lodash.get(eventObject, 'lastTimestamp') as string) ??
				(lodash.get(eventObject, 'eventTime') as string) ??
				(lodash.get(eventObject, 'metadata.creationTimestamp') as string) ??
				''
		};
	}

	// Kubernetes' own field selector, not a client-side filter: events for every other
	// object in the namespace never cross the wire.
	function buildEventFieldSelector(): string {
		const selectors = [`involvedObject.name=${name}`, `involvedObject.kind=${kind}`];
		if (namespace) selectors.push(`involvedObject.namespace=${namespace}`);
		return selectors.join(',');
	}

	let eventsAbortController: AbortController | null = null;
	async function fetchEvents() {
		eventsAbortController?.abort();
		const currentAbortController = new AbortController();
		eventsAbortController = currentAbortController;

		isEventsLoading = true;
		try {
			const response = await resourceClient.list(
				{
					cluster,
					namespace,
					group: '',
					version: 'v1',
					resource: 'events',
					fieldSelector: buildEventFieldSelector()
				} as ListRequest,
				{ signal: currentAbortController.signal }
			);
			if (currentAbortController.signal.aborted) return;
			events = response.items
				.map((item, index) => toEventRow(item.object as JsonObject, index))
				.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
		} catch (e) {
			if (currentAbortController.signal.aborted) return;
			console.error('Failed to list events:', e);
			events = [];
		} finally {
			if (!currentAbortController.signal.aborted) isEventsLoading = false;
		}
	}

	$effect(() => {
		if (!showEventTab) return;
		void namespace;
		void kind;
		void name;
		fetchEvents();
	});

	const eventColumns: ColumnDef<EventRow>[] = [
		{ accessorKey: 'name' },
		{ accessorKey: 'type' },
		{ accessorKey: 'reason' },
		{ accessorKey: 'message' },
		{ accessorKey: 'count' },
		{ accessorKey: 'lastSeen' }
	];

	// --- Condition tab ---

	type ConditionRow = {
		key: string;
		type: string;
		status: string;
		reason: string;
		message: string;
		lastTransitionTime: string;
	};

	const conditions = $derived.by<ConditionRow[]>(() => {
		const raw = lodash.get(object, 'status.conditions');
		if (!Array.isArray(raw)) return [];
		return raw.map((condition, index) => ({
			key: `${lodash.get(condition, 'type') ?? index}`,
			type: (lodash.get(condition, 'type') as string) ?? '—',
			status: (lodash.get(condition, 'status') as string) ?? 'Unknown',
			reason: (lodash.get(condition, 'reason') as string) ?? '—',
			message: (lodash.get(condition, 'message') as string) ?? '—',
			lastTransitionTime: (lodash.get(condition, 'lastTransitionTime') as string) ?? ''
		}));
	});

	const conditionColumns: ColumnDef<ConditionRow>[] = [
		{ accessorKey: 'type' },
		{ accessorKey: 'status' },
		{ accessorKey: 'reason' },
		{ accessorKey: 'message' },
		{ accessorKey: 'lastTransitionTime' }
	];

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
		eventsAbortController?.abort();
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

					{#each [Metadatacluster, MetadataNamespace, MetadataCreationTimestamp, MetadataGeneration].filter((metadata) => metadata.value) as metadata, index (index)}
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
			<Field.Set>
				<Tabs.Root value="related-resource" class="w-full">
					<Tabs.List>
						<Tabs.Trigger value="related-resource">Related Resource</Tabs.Trigger>
						{#if showEventTab}
							<Tabs.Trigger value="event">Event</Tabs.Trigger>
						{/if}
						{#if showConditionTab}
							<Tabs.Trigger value="condition">Condition</Tabs.Trigger>
						{/if}
					</Tabs.List>
					<Tabs.Content value="related-resource">
						<RelatedInformationTable
							data={sortedRelatedResources}
							columns={relatedResourceColumns}
							getRowId={getRelatedResourceRowId}
							placeholder="Filter related resources…"
							emptyMessage="No related resources."
						>
							{#snippet header()}
								<Table.Row>
									<Table.Head>Group</Table.Head>
									<Table.Head>Version</Table.Head>
									<Table.Head>Resource</Table.Head>
									<Table.Head>Name</Table.Head>
									<Table.Head>Namespace</Table.Head>
								</Table.Row>
							{/snippet}
							{#snippet row(relatedResource)}
								<Table.Row>
									<Table.Cell>{relatedResource.group || 'core'}</Table.Cell>
									<Table.Cell>{relatedResource.version}</Table.Cell>
									<Table.Cell>{relatedResource.resource}</Table.Cell>
									<Table.Cell>
										<!-- eslint-disable svelte/no-navigation-without-resolve -->
										<a
											href={getRelatedResourceURL(relatedResource)}
											target="_blank"
											rel="noopener noreferrer"
											class="hover:underline"
										>
											{relatedResource.name}
										</a>
									</Table.Cell>
									<Table.Cell>{relatedResource.namespace ?? '—'}</Table.Cell>
								</Table.Row>
							{/snippet}
						</RelatedInformationTable>
					</Tabs.Content>
					{#if showEventTab}
						<Tabs.Content value="event">
							<RelatedInformationTable
								data={events}
								columns={eventColumns}
								getRowId={(row) => row.key}
								placeholder="Filter events…"
								emptyMessage="No events found."
								loading={isEventsLoading}
								loadingMessage="Loading events…"
							>
								{#snippet header()}
									<Table.Row>
										<Table.Head>Name</Table.Head>
										<Table.Head>Type</Table.Head>
										<Table.Head>Reason</Table.Head>
										<Table.Head>Message</Table.Head>
										<Table.Head>Count</Table.Head>
										<Table.Head>Last Seen</Table.Head>
									</Table.Row>
								{/snippet}
								{#snippet row(event)}
									<Table.Row>
										<Table.Cell>
											<!-- eslint-disable svelte/no-navigation-without-resolve -->
											<a
												href={getEventResourceURL(event)}
												target="_blank"
												rel="noopener noreferrer"
												class="hover:underline"
											>
												{event.name}
											</a>
										</Table.Cell>
										<Table.Cell>{event.type}</Table.Cell>
										<Table.Cell>{event.reason}</Table.Cell>
										<Table.Cell title={event.message}>{event.message}</Table.Cell>
										<Table.Cell>{event.count}</Table.Cell>
										<Table.Cell>{formatTimestamp(event.lastSeen)}</Table.Cell>
									</Table.Row>
								{/snippet}
							</RelatedInformationTable>
						</Tabs.Content>
					{/if}
					{#if showConditionTab}
						<Tabs.Content value="condition">
							<RelatedInformationTable
								data={conditions}
								columns={conditionColumns}
								getRowId={(row) => row.key}
								placeholder="Filter conditions…"
								emptyMessage="No conditions reported."
							>
								{#snippet header()}
									<Table.Row>
										<Table.Head>Type</Table.Head>
										<Table.Head>Status</Table.Head>
										<Table.Head>Reason</Table.Head>
										<Table.Head>Message</Table.Head>
										<Table.Head>Last Transition</Table.Head>
									</Table.Row>
								{/snippet}
								{#snippet row(condition)}
									<Table.Row>
										<Table.Cell>{condition.type}</Table.Cell>
										<Table.Cell>{condition.status}</Table.Cell>
										<Table.Cell>{condition.reason}</Table.Cell>
										<Table.Cell title={condition.message}>{condition.message}</Table.Cell>
										<Table.Cell>{formatTimestamp(condition.lastTransitionTime)}</Table.Cell>
									</Table.Row>
								{/snippet}
							</RelatedInformationTable>
						</Tabs.Content>
					{/if}
				</Tabs.Root>
			</Field.Set>
		{/if}
	</Field.Group>
{/if}
