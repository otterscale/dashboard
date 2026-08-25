<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { type ColumnDef, getCoreRowModel, getFilteredRowModel } from '@tanstack/table-core';
	import lodash from 'lodash';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createSvelteTable } from '$lib/components/ui/data-table';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	import type { RelatedResource } from './types';

	type ResourceRow = RelatedResource & { key: string };

	let {
		group,
		version,
		kind,
		resource,
		namespace,
		name,
		relatedResources = []
	}: {
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespace: string;
		name: string;
		relatedResources?: RelatedResource[];
	} = $props();

	function getResourceURL(relatedResource: RelatedResource): string {
		const searchParameters = new URLSearchParams({
			group: relatedResource.group,
			version: relatedResource.version,
			kind: relatedResource.kind,
			resource: relatedResource.resource,
			...(relatedResource.namespace ? { namespace: relatedResource.namespace } : {}),
			query: `Name:${relatedResource.name}`
		});
		return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}?${searchParameters}`);
	}

	const resources = $derived<ResourceRow[]>(
		[{ group, version, kind, resource, namespace, name }, ...relatedResources].map((r) => ({
			...r,
			key: `${r.group}/${r.version}/${r.kind}/${r.namespace ?? ''}/${r.name}`
		}))
	);

	let globalFilter = $state('');

	const columns: ColumnDef<ResourceRow>[] = [
		{ accessorKey: 'group', header: 'Group' },
		{ accessorKey: 'version', header: 'Version' },
		{ accessorKey: 'resource', header: 'Resource' },
		{ accessorKey: 'name', header: 'Name' },
		{ accessorKey: 'namespace', header: 'Namespace' }
	];

	const table = createSvelteTable<ResourceRow>({
		get data() {
			return resources;
		},
		columns,
		getRowId: (row) => row.key,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
		},
		state: {
			get globalFilter() {
				return globalFilter;
			}
		}
	});

	const filteredResources = $derived(table.getFilteredRowModel().rows.map((row) => row.original));

	// The inventory lists objects in no useful order.
	const sortedResources = $derived(
		lodash.sortBy(filteredResources, ['group', 'version', 'resource', 'namespace', 'name'])
	);
</script>

<div class="space-y-4">
	<InputGroup.Root class="max-w-sm">
		<InputGroup.Addon>
			<SearchIcon class="size-4 text-muted-foreground" />
		</InputGroup.Addon>
		<InputGroup.Input
			placeholder="Filter by group, version, resource, name, or namespace"
			bind:value={globalFilter}
		/>
	</InputGroup.Root>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Group</Table.Head>
				<Table.Head>Version</Table.Head>
				<Table.Head>Resource</Table.Head>
				<Table.Head>Name</Table.Head>
				<Table.Head>Namespace</Table.Head>
				<Table.Head class="w-0"></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if sortedResources.length === 0}
				<Table.Row>
					<Table.Cell colspan={6} class="text-center text-sm text-muted-foreground">
						No related resources match "{globalFilter}".
					</Table.Cell>
				</Table.Row>
			{/if}
			{#each sortedResources as relatedResource (relatedResource.key)}
				<Table.Row>
					<Table.Cell class="text-muted-foreground">{relatedResource.group || 'core'}</Table.Cell>
					<Table.Cell class="text-muted-foreground">{relatedResource.version}</Table.Cell>
					<Table.Cell class="text-muted-foreground">{relatedResource.resource}</Table.Cell>
					<Table.Cell class="font-medium">
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
					<Table.Cell class="text-muted-foreground">
						{relatedResource.namespace ?? '—'}
					</Table.Cell>
					<Table.Cell>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={getResourceURL(relatedResource)}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open {relatedResource.name}"
						>
							<ExternalLinkIcon class="size-4 text-muted-foreground" />
						</a>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
