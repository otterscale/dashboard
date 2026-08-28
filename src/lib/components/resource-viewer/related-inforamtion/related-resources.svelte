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
	};

	const columns: ColumnDef<RelatedResourceRow>[] = [
		{ accessorKey: 'group' },
		{ accessorKey: 'message' },
		{ accessorKey: 'name' },
		{ accessorKey: 'namespace' },
		{ accessorKey: 'resource' },
		{ accessorKey: 'status' },
		{ accessorKey: 'version' }
	];

	function getRowId(row: RelatedResource): string {
		return `${row.group}/${row.version}/${row.resource}/${row.namespace ?? ''}/${row.name}`;
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
					object: currentObject as unknown as JsonObject,
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

	const sortedRelatedResources = $derived<(RelatedResource & { id: string })[]>(
		lodash
			.sortBy(relatedResources, ['group', 'version', 'resource', 'namespace', 'name'])
			.map((related) => ({ ...related, id: getRowId(related) }))
	);

	// Compute a status for every row from the object its getter already fetched.
	// A row without one is a reference the cluster no longer resolves, so it simply
	// has no status — there is nothing left here to fetch.
	const statuses = $derived<Record<string, Result>>(
		Object.fromEntries(
			sortedRelatedResources
				.filter((row) => row.object)
				.map((row) => [row.id, compute(row.object as KubernetesResource)])
		)
	);

	const rows = $derived<RelatedResourceRow[]>(
		sortedRelatedResources.map((related) => ({
			...related,
			status: lodash.get(statuses, related.id, undefined)
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
			<Table.Cell>{relatedResource.status?.status}</Table.Cell>
			<Table.Cell>{relatedResource.status?.message}</Table.Cell>
		</Table.Row>
	{/snippet}
</RelatedInformationTable>
