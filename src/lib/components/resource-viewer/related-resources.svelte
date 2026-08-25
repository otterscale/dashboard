<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { type Transport } from '@connectrpc/connect';
	import lodash from 'lodash';
	import { getContext } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getRelatedResourcesGetter } from '$lib/components/resource-viewer/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	import type { RelatedResource } from './types';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		namespace,
		name,
		object
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespace: string;
		name: string;
		object: JsonObject;
	} = $props();

	const transport: Transport = getContext('transport');

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

	const getRelatedResources = $derived(getRelatedResourcesGetter(resource));
	let relatedResources: RelatedResource[] = $state([]);
	$effect(() => {
		if (!getRelatedResources || !object) {
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
					object,
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
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Group</Table.Head>
			<Table.Head>Version</Table.Head>
			<Table.Head>Resource</Table.Head>
			<Table.Head>Name</Table.Head>
			<Table.Head>Namespace</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each lodash.sortBy( relatedResources, ['group', 'version', 'resource', 'namespace', 'name'] ) as relatedResource (relatedResource)}
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
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={6} class="text-center text-sm text-muted-foreground">
					No related resources.
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
