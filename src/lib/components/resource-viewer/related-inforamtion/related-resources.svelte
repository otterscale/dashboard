<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { type GetRequest, ResourceService } from '@otterscale/api/resource/v1';
	import { type ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';
	import { getContext } from 'svelte';

	import * as Table from '$lib/components/ui/table/index.js';
	import { compute, type KubernetesResource, type Result } from '$lib/utils/kstatus';

	import RelatedInformationTable from '../related-information-table.svelte';
	import { getRelatedResourcesGetter } from '../related-resource-getters';
	import type { RelatedResource, ResourceObject } from '../types';
	import { getResourceURL } from '../utils';

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
		object: ResourceObject | undefined;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	type RelatedResourceRow = RelatedResource & {
		id: string;
		status?: Result;
	};

	const columns: ColumnDef<RelatedResourceRow>[] = [
		{ accessorKey: 'group' },
		{ accessorKey: 'version' },
		{ accessorKey: 'resource' },
		{ accessorKey: 'name' },
		{ accessorKey: 'namespace' },
		{ accessorKey: 'status' }
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

	let statuses: Record<string, Result> = $state({});
	let statusesAbortController: AbortController | null = null;
	// Re-fetch statuses whenever the related-resource list changes; a slow batch
	// of GETs should not resolve over a newer list.
	$effect(() => {
		const rows = sortedRelatedResources;

		statusesAbortController?.abort();
		if (rows.length === 0) {
			statuses = {};
			return;
		}

		const abortController = new AbortController();
		statusesAbortController = abortController;

		(async () => {
			const entries = await Promise.all(
				rows.map(async (row) => {
					try {
						const response = await resourceClient.get(
							{
								cluster,
								namespace: row.namespace ?? '',
								group: row.group,
								version: row.version,
								resource: row.resource,
								name: row.name
							} as GetRequest,
							{ signal: abortController.signal }
						);
						return [row.id, compute(response.object as KubernetesResource)] as const;
					} catch {
						return [row.id, { status: undefined, message: undefined } as Result] as const;
					}
				})
			);
			if (abortController.signal.aborted) return;
			statuses = Object.fromEntries(entries) as Record<string, Result>;
		})();

		return () => abortController.abort();
	});

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
			<Table.Head>Group</Table.Head>
			<Table.Head>Version</Table.Head>
			<Table.Head>Resource</Table.Head>
			<Table.Head>Name</Table.Head>
			<Table.Head>Namespace</Table.Head>
			<Table.Head>Status</Table.Head>
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
					href={getResourceURL(relatedResource)}
					target="_blank"
					rel="noopener noreferrer"
					class="hover:underline"
				>
					{relatedResource.name}
				</a>
			</Table.Cell>
			<Table.Cell>{relatedResource.namespace}</Table.Cell>
			<Table.Cell>{relatedResource.status?.status}</Table.Cell>
		</Table.Row>
	{/snippet}
</RelatedInformationTable>
