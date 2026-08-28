<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { type Transport } from '@connectrpc/connect';
	import { type ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';
	import { getContext } from 'svelte';

	import * as Table from '$lib/components/ui/table/index.js';
	import { compute, type KubernetesResource, type Result } from '$lib/utils/kstatus';

	import { getRelatedResourcesGetter } from '../related-resource-getters';
	import type { RelatedResource, Resource } from '../types';
	import { getResourceURL } from '../utils';
	import RelatedInformationTable from './table.svelte';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		name,
		object
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		name: string;
		object?: Resource;
	} = $props();

	const transport: Transport = getContext('transport');

	type RelatedResourceRow = RelatedResource & {
		id: string;
		status?: Result;
		uid: string;
	};

	const columns: ColumnDef<RelatedResourceRow>[] = [
		{ accessorKey: 'group' },
		{ accessorKey: 'message' },
		{ accessorKey: 'name' },
		{ accessorKey: 'namespace' },
		{ accessorKey: 'resource' },
		{ accessorKey: 'source' },
		{ accessorKey: 'status' },
		{ accessorKey: 'version' }
	];

	const getRelatedResources = $derived(getRelatedResourcesGetter(resource));
	let relatedResources: RelatedResource[] = $state([]);

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
					object: currentObject as unknown as JsonObject,
					transport,
					signal: abortController.signal
				});
				if (abortController.signal.aborted) return;
				relatedResources = resources;
			} catch (e) {
				if (abortController.signal.aborted) return;
				console.error('Failed to get related resources:', e);
				relatedResources = [];
			}
		})();

		return () => abortController.abort();
	});

	const rows = $derived<RelatedResourceRow[]>(
		relatedResources.map((relatedResource) => ({
			...relatedResource,
			status: compute(relatedResource.object as KubernetesResource),
			id: lodash.get(
				relatedResource,
				'object.metadata.uid',
				relatedResource.group +
					relatedResource.version +
					relatedResource.resource +
					relatedResource.namespace +
					relatedResource.name
			) as string,
			uid: lodash.get(
				relatedResource,
				'object.metadata.uid',
				relatedResource.group +
					relatedResource.version +
					relatedResource.resource +
					relatedResource.namespace +
					relatedResource.name
			) as string
		}))
	);
</script>

<RelatedInformationTable data={rows} {columns}>
	{#snippet header()}
		<Table.Row>
			<Table.Head>Resource</Table.Head>
			<Table.Head>Name</Table.Head>
			<Table.Head>Namespace</Table.Head>
			<Table.Head>Version</Table.Head>
			<Table.Head>Group</Table.Head>
			<Table.Head>Source</Table.Head>
			<Table.Head>Status</Table.Head>
			<Table.Head>Message</Table.Head>
		</Table.Row>
	{/snippet}
	{#snippet row(relatedResource)}
		<Table.Row>
			<Table.Cell>{relatedResource.resource}</Table.Cell>
			<Table.Cell>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a href={getResourceURL(relatedResource)} rel="noopener noreferrer" class="hover:underline">
					{relatedResource.name}
				</a>
			</Table.Cell>
			<Table.Cell>{relatedResource.namespace}</Table.Cell>
			<Table.Cell>{relatedResource.version}</Table.Cell>
			<Table.Cell>{relatedResource.group || 'core'}</Table.Cell>
			<Table.Cell>{relatedResource.source}</Table.Cell>
			<Table.Cell>{relatedResource.status?.status}</Table.Cell>
			<Table.Cell>{relatedResource.status?.message}</Table.Cell>
		</Table.Row>
	{/snippet}
</RelatedInformationTable>
