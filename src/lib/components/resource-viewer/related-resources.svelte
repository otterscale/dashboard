<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

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

	function getAPIVersion(relatedResource: RelatedResource): string {
		return relatedResource.group
			? `${relatedResource.group}/${relatedResource.version}`
			: relatedResource.version;
	}
</script>

<Field.Set>
	{@const resources = [{ group, version, kind, resource, namespace, name }, ...relatedResources]}
	<Item.Root class="p-0">
		<Item.Content>
			<Item.Title>Related Resources</Item.Title>
			<Item.Description>
				{resources.length} related resources
			</Item.Description>
		</Item.Content>
	</Item.Root>
	<div class="min-h-xl grid grid-cols-1 gap-4 p-0 lg:grid-cols-3">
		{#each resources as resource, index (index)}
			<Item.Root variant="outline">
				{#snippet child({ props })}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a href={getResourceURL(resource)} target="_blank" rel="noopener noreferrer" {...props}>
						<Item.Content>
							<Item.Title>{resource.name}</Item.Title>
							<Item.Description>
								{resource.resource}.{getAPIVersion(resource)}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<ExternalLinkIcon class="size-4" />
						</Item.Actions>
					</a>
				{/snippet}
			</Item.Root>
		{/each}
	</div>
</Field.Set>
