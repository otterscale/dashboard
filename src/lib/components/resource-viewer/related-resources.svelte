<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';

	import type { RelatedResource } from './types';

	let {
		self,
		relatedResources = [],
		namespace = ''
	}: {
		/**
		 * The resource whose page this is. Listed first and always present, so every
		 * resource offers a way back to itself in the list it came from — where its
		 * row actions live.
		 */
		self: RelatedResource;
		/** Everything else this resource points at, in the order it should be read. */
		relatedResources?: RelatedResource[];
		/**
		 * Where the entries live, for those that do not say. Not necessarily the
		 * namespace of `self`: a resource often owns children elsewhere.
		 */
		namespace?: string;
	} = $props();

	const resources = $derived([self, ...relatedResources]);

	/**
	 * Links to the resource's row in the list page rather than to a detail page:
	 * the list is where actions on a resource live, and filtering it by name keeps
	 * the surrounding resources of the same kind visible.
	 */
	function getResourceUrl(relatedResource: RelatedResource): string {
		const searchParameters = new URLSearchParams({
			group: relatedResource.group,
			version: relatedResource.version,
			kind: relatedResource.kind,
			resource: relatedResource.resource,
			...(relatedResource.namespaced
				? { namespace: relatedResource.namespace ?? namespace }
				: {}),
			query: `Name:${relatedResource.name}`
		});
		return resolve(
			`/(auth)/${page.params.cluster}/${page.params.workspace}?${searchParameters}`
		);
	}

	/**
	 * A namespaced resource with nowhere to look is not linkable: the list page
	 * would open on the wrong namespace and appear empty.
	 */
	function isLinkable(relatedResource: RelatedResource): boolean {
		if (!relatedResource.namespaced) return true;
		return Boolean(relatedResource.namespace ?? namespace);
	}

	function getApiVersion(relatedResource: RelatedResource): string {
		return relatedResource.group
			? `${relatedResource.group}/${relatedResource.version}`
			: relatedResource.version;
	}

	const linkableResources = $derived(resources.filter(isLinkable));
</script>

{#if linkableResources.length > 0}
	<Field.Set>
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Related Resources</Item.Title>
				<Item.Description>
					{linkableResources.length} related resources
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<div class="min-h-xl grid grid-cols-1 gap-4 p-0 lg:grid-cols-3">
			{#each linkableResources as relatedResource, index (index)}
				<Item.Root variant="outline">
					{#snippet child({ props })}
						<a
							href={getResourceUrl(relatedResource)}
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						>
							<Item.Content>
								<Item.Title>{relatedResource.name}</Item.Title>
								<Item.Description>
									{relatedResource.resource}.{getApiVersion(relatedResource)}
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
{/if}
