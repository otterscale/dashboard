<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		type APIResource,
		type DiscoveryRequest,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	import RelatedResources from '../../related-resources.svelte';
	import type { RelatedResource } from '../../types';

	/** One key/value card in a section. */
	type SpecEntry = { key: string; value: string };

	/** A condition, as both Flux and the kro wrapper write it. */
	type Condition = {
		type?: string;
		status?: string;
		reason?: string;
		message?: string;
		lastTransitionTime?: string;
	};

	/** One object Helm applied, as Flux records it in `status.inventory`. */
	type InventoryEntry = { id?: string; v?: string };

	let {
		group,
		version,
		kind,
		resource,
		namespace,
		name,
		object
	}: {
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespace: string;
		name: string;
		object: HelmToolkitFluxcdIoV2HelmRelease;
	} = $props();

	const abortController = new AbortController();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// A kro-managed release keeps its conditions under a different key, the same
	// split the HelmRelease table column makes.
	const conditions = $derived.by(() => {
		const fluxConditions = (lodash.get(object, ['status', 'conditions']) ?? []) as Condition[];
		const kroConditions = (lodash.get(object, ['status', 'helmReleaseConditions']) ??
			[]) as Condition[];
		// Unmet conditions first: a release that is not ready is the case worth reading.
		return [...(fluxConditions.length > 0 ? fluxConditions : kroConditions)].sort(
			(previous, next) => Number(previous.status === 'True') - Number(next.status === 'True')
		);
	});

	function toDefinedEntries(entries: { key: string; value: unknown }[]): SpecEntry[] {
		return entries.flatMap((entry) =>
			entry.value === null || entry.value === undefined || entry.value === ''
				? []
				: [{ key: entry.key, value: String(entry.value) }]
		);
	}

	const chartEntries = $derived(
		toDefinedEntries([
			{ key: 'chart', value: lodash.get(object, ['spec', 'chart', 'spec', 'chart']) },
			{ key: 'version', value: lodash.get(object, ['spec', 'chart', 'spec', 'version']) },
			{
				key: 'sourceRef.kind',
				value: lodash.get(object, ['spec', 'chart', 'spec', 'sourceRef', 'kind'])
			},
			{
				key: 'sourceRef.name',
				value: lodash.get(object, ['spec', 'chart', 'spec', 'sourceRef', 'name'])
			},
			{ key: 'interval', value: lodash.get(object, ['spec', 'chart', 'spec', 'interval']) }
		])
	);

	const releaseEntries = $derived(
		toDefinedEntries([
			{ key: 'releaseName', value: lodash.get(object, ['spec', 'releaseName']) },
			{ key: 'targetNamespace', value: lodash.get(object, ['spec', 'targetNamespace']) },
			{ key: 'storageNamespace', value: lodash.get(object, ['spec', 'storageNamespace']) },
			{ key: 'interval', value: lodash.get(object, ['spec', 'interval']) },
			{ key: 'timeout', value: lodash.get(object, ['spec', 'timeout']) },
			{ key: 'suspend', value: lodash.get(object, ['spec', 'suspend']) }
		])
	);

	const revisionEntries = $derived(
		toDefinedEntries([
			{ key: 'lastAppliedRevision', value: lodash.get(object, ['status', 'lastAppliedRevision']) },
			{
				key: 'lastAttemptedRevision',
				value: lodash.get(object, ['status', 'lastAttemptedRevision'])
			},
			{ key: 'helmChart', value: lodash.get(object, ['status', 'helmChart']) },
			{ key: 'failures', value: lodash.get(object, ['status', 'failures']) },
			{ key: 'installFailures', value: lodash.get(object, ['status', 'installFailures']) },
			{ key: 'upgradeFailures', value: lodash.get(object, ['status', 'upgradeFailures']) }
		])
	);

	const isSuspended = $derived(lodash.get(object, ['spec', 'suspend']) === true);

	/**
	 * What the cluster serves, by `group/kind`. The inventory names a group and a
	 * kind; a link needs the version and the plural resource too, and discovery is
	 * what knows them.
	 */
	let apiResources: APIResource[] = $state([]);
	let isLoaded = $state(false);
	const apiResourcesByGroupKind = $derived.by(() => {
		const groupedAPIResources = new Map<string, APIResource[]>();
		for (const apiResource of apiResources) {
			// Subresources (`pods/log`) are not something to link to.
			if (apiResource.resource.includes('/')) continue;
			const key = `${apiResource.group}/${apiResource.kind}`;
			groupedAPIResources.set(key, [...(groupedAPIResources.get(key) ?? []), apiResource]);
		}
		return groupedAPIResources;
	});

	function findAPIResource(
		entryGroup: string,
		entryKind: string,
		entryVersion: string
	): APIResource | undefined {
		const candidates = apiResourcesByGroupKind.get(`${entryGroup}/${entryKind}`) ?? [];
		// The version the object was applied with, when the cluster still serves it;
		// otherwise whatever discovery listed first, which is its preferred version.
		return candidates.find((candidate) => candidate.version === entryVersion) ?? candidates[0];
	}

	const relatedResources: RelatedResource[] = $derived.by(() => {
		const entries = (lodash.get(object, ['status', 'inventory', 'entries']) ??
			[]) as InventoryEntry[];
		return entries.flatMap((entry) => {
			// Flux encodes each applied object as `namespace_name_group_kind`, with an
			// empty group for core resources and an empty namespace for cluster-scoped
			// ones. None of the four parts can itself contain an underscore.
			const parts = (entry.id ?? '').split('_');
			if (parts.length !== 4) return [];
			const [entryNamespace, entryName, entryGroup, entryKind] = parts;
			if (!entryName || !entryKind) return [];

			const apiResource = findAPIResource(entryGroup, entryKind, entry.v ?? '');
			if (!apiResource) {
				// A kind the cluster no longer serves — its CRD was removed after the
				// release applied it, so there is nothing to link to.
				console.warn(`No API resource for inventory entry ${entry.id}`);
				return [];
			}

			return [
				{
					group: apiResource.group,
					version: apiResource.version,
					kind: apiResource.kind,
					resource: apiResource.resource,
					name: entryName,
					// Kept as the empty string for a cluster-scoped object, so it does not
					// fall back to the namespace of the release.
					namespace: entryNamespace
				} satisfies RelatedResource
			];
		});
	});

	// Every inventory entry needs discovery to become a link, so the sections wait
	// for it rather than rendering a section that fills in afterwards.
	onMount(async () => {
		try {
			const response = await resourceClient.discovery(
				{ cluster: page.params.cluster } as DiscoveryRequest,
				{ signal: abortController.signal }
			);
			apiResources = response.apiResources;
		} catch (error) {
			if (abortController.signal.aborted) return;
			console.error('Failed to discover API resources:', error);
		} finally {
			isLoaded = true;
		}
	});

	onDestroy(() => {
		abortController.abort();
	});
</script>

{#if !isLoaded}
	<Field.Group>
		<Field.Set>
			{#each Array(23).keys() as index (index)}
				<Skeleton class="h-5 w-full" />
			{/each}
		</Field.Set>
	</Field.Group>
{:else}
	<Field.Group class="space-y-4 *:gap-4 *:not-has-[*]:hidden">
		<Field.Set>
			{#if conditions.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Status</Item.Title>
						<Item.Description>status.conditions</Item.Description>
					</Item.Content>
					{#if isSuspended}
						<Item.Actions>
							<Badge variant="outline">suspended</Badge>
						</Item.Actions>
					{/if}
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0">
					{#each conditions as condition, index (index)}
						{#if condition.status === 'True'}
							<Item.Root>
								<Item.Content>
									<Item.Title>
										{condition.type}
									</Item.Title>
									<Item.Description>
										{condition.lastTransitionTime}
									</Item.Description>
								</Item.Content>
								<Item.Actions>
									<Badge>{condition.type}</Badge>
								</Item.Actions>
							</Item.Root>
						{:else}
							<Item.Root>
								<Item.Content>
									<Item.Title>
										{condition.reason}
									</Item.Title>
									<Item.Description>{condition.message}</Item.Description>
								</Item.Content>
								<Item.Actions>
									<Badge variant="destructive">{condition.type}</Badge>
								</Item.Actions>
							</Item.Root>
						{/if}
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{#if chartEntries.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Chart</Item.Title>
						<Item.Description>spec.chart.spec</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each chartEntries as entry, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>
									{entry.key}
								</Item.Description>
								<Item.Title class="break-all">
									{entry.value}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{#if releaseEntries.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Release</Item.Title>
						<Item.Description>spec</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each releaseEntries as entry, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>
									{entry.key}
								</Item.Description>
								<Item.Title class="break-all">
									{entry.value}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{#if revisionEntries.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Revision</Item.Title>
						<Item.Description>status</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each revisionEntries as entry, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>
									{entry.key}
								</Item.Description>
								<Item.Title class="break-all">
									{entry.value}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<RelatedResources {group} {version} {kind} {resource} {namespace} {name} {relatedResources} />
	</Field.Group>
{/if}
