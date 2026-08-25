<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import lodash from 'lodash';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';

	import type { RelatedResource } from './types';

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

	const resources = $derived([
		{ group, version, kind, resource, namespace, name },
		...relatedResources
	]);

	/**
	 * Grouped by the whole group/version/kind rather than the kind alone: two API
	 * groups can serve the same kind (`Ingress`, say), and those are not the same
	 * thing to look at. The resource itself heads the first group.
	 */
	const groupedResources = $derived(
		Object.values(
			lodash.groupBy(
				resources,
				(relatedResource) =>
					`${relatedResource.group}/${relatedResource.version}/${relatedResource.kind}`
			)
		).map((kindResources) => {
			const [firstResource] = kindResources;
			const apiGroup = firstResource.group ? firstResource.group : 'core';
			return {
				kind: firstResource.kind,
				identifier: `${apiGroup}.${firstResource.version}.${firstResource.resource}`,
				// The inventory lists objects in no useful order.
				resources: lodash.sortBy(kindResources, ['namespace', 'name']).map((kindResource) => ({
					...kindResource,
					key: `${kindResource.namespace}/${kindResource.name}`
				}))
			};
		})
	);
</script>

<Field.Set>
	{#each groupedResources as groupedResource (groupedResource.identifier)}
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related {groupedResource.kind}</Item.Title>
				<Item.Description>{groupedResource.identifier}</Item.Description>
			</Item.Content>
			<Item.Actions>
				{groupedResource.resources.length}
			</Item.Actions>
		</Item.Root>
		<div class="min-h-xl grid grid-cols-1 gap-4 p-0 lg:grid-cols-3">
			{#each groupedResource.resources as relatedResource (relatedResource.key)}
				<Item.Root variant="outline">
					{#snippet child({ props })}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={getResourceURL(relatedResource)}
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						>
							<Item.Content>
								<Item.Title>
									{relatedResource.name}
								</Item.Title>
								{#if relatedResource.namespace}
									<Item.Description>{relatedResource.namespace}</Item.Description>
								{/if}
							</Item.Content>
							<Item.Actions>
								<ExternalLinkIcon class="size-4" />
							</Item.Actions>
						</a>
					{/snippet}
				</Item.Root>
			{/each}
		</div>
	{/each}
</Field.Set>
