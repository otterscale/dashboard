<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha1LLMInferenceService } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	import RelatedResources from '../../related-resources.svelte';
	import type { RelatedResource } from '../../types';

	/** The identity of a listed object — all the linking needs from an item. */
	type ListedObject = { metadata?: { name?: string; namespace?: string } };

	/** A related resource kind, before the listing fills in the names. */
	type RelatedResourceIdentifier = Omit<RelatedResource, 'name' | 'namespace'>;

	/** One key/value card in a section. */
	type SpecEntry = { key: string; value: string };

	/** As much of a container as this view reads. */
	type ContainerLike = {
		name?: string;
		image?: string;
		resources?: {
			limits?: Record<string, string | number>;
			requests?: Record<string, string | number>;
		};
	};
	type ContainerSummary = { role: string; name: string; image: string; resources: string[] };

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
		object: ServingKserveIoV1Alpha1LLMInferenceService;
	} = $props();

	const abortController = new AbortController();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const conditions = $derived(
		[...(object?.status?.conditions ?? [])].sort(
			(previous, next) => Number(previous.status === 'True') - Number(next.status === 'True')
		)
	);

	function toSpecEntries(value: unknown): SpecEntry[] {
		if (typeof value !== 'object' || value === null) return [];
		return Object.entries(value).flatMap(([key, leaf]) =>
			leaf === null || leaf === undefined || leaf === '' || typeof leaf === 'object'
				? []
				: [{ key, value: String(leaf) }]
		);
	}

	const modelEntries = $derived(toSpecEntries(lodash.get(object, ['spec', 'model'])));

	const workloadRoles = [
		{ role: 'decode', path: ['spec'] },
		{ role: 'prefill', path: ['spec', 'prefill'] }
	];
	const containers = $derived.by(() =>
		workloadRoles.flatMap(({ role, path }) => {
			const roleContainers = (lodash.get(object, [...path, 'template', 'containers']) ??
				[]) as ContainerLike[];
			return roleContainers.map(
				(container) =>
					({
						role,
						name: container.name ?? '',
						image: container.image ?? '',
						resources: Object.entries({
							...container.resources?.requests,
							...container.resources?.limits
						}).map(([key, value]) => `${key}=${value}`)
					}) satisfies ContainerSummary
			);
		})
	);

	const baseRefs = $derived(
		(lodash.get(object, ['spec', 'baseRefs']) ?? []) as { name?: string }[]
	);

	const relatedResourceIdentifiers: RelatedResourceIdentifier[] = [
		{ group: 'apps', version: 'v1', kind: 'Deployment', resource: 'deployments' },
		{
			group: 'leaderworkerset.x-k8s.io',
			version: 'v1',
			kind: 'LeaderWorkerSet',
			resource: 'leaderworkersets'
		},
		{ group: 'apps', version: 'v1', kind: 'ReplicaSet', resource: 'replicasets' },
		{ group: 'apps', version: 'v1', kind: 'StatefulSet', resource: 'statefulsets' },
		{ group: '', version: 'v1', kind: 'Service', resource: 'services' },
		{ group: '', version: 'v1', kind: 'Pod', resource: 'pods' },
		{
			group: 'inference.networking.k8s.io',
			version: 'v1',
			kind: 'InferencePool',
			resource: 'inferencepools'
		},
		{
			group: 'gateway.networking.k8s.io',
			version: 'v1',
			kind: 'HTTPRoute',
			resource: 'httproutes'
		}
	];

	const labelSelector = $derived(
		`app.kubernetes.io/part-of=llminferenceservice,app.kubernetes.io/name=${name}`
	);

	let relatedResources: RelatedResource[] = $state([]);
	let isLoaded = $state(false);

	async function listRelatedResources(
		identifier: RelatedResourceIdentifier
	): Promise<RelatedResource[]> {
		try {
			const response = await resourceClient.list(
				{
					cluster: page.params.cluster,
					namespace,
					labelSelector,
					group: identifier.group,
					version: identifier.version,
					resource: identifier.resource
				} as ListRequest,
				{ signal: abortController.signal }
			);
			return response.items.flatMap((item) => {
				const metadata = (item.object as ListedObject | undefined)?.metadata;
				return metadata?.name
					? [
							{
								...identifier,
								name: metadata.name,
								namespace: metadata.namespace ?? undefined
							} satisfies RelatedResource
						]
					: [];
			});
		} catch (error) {
			// One forbidden or missing kind should not empty the whole section.
			if (abortController.signal.aborted) return [];
			console.error(`Failed to list ${identifier.resource}:`, error);
			return [];
		}
	}

	onMount(async () => {
		const results = await Promise.all(
			relatedResourceIdentifiers.map((identifier) => listRelatedResources(identifier))
		);
		relatedResources = results.flat();
		isLoaded = true;
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
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
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
			{#if modelEntries.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Model</Item.Title>
						<Item.Description>spec.model</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each modelEntries as entry, index (index)}
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
			{#if containers.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Containers</Item.Title>
						<Item.Description>spec.template.containers</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-2">
					{#each containers as container, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>
									{container.role}.{container.name}
								</Item.Description>
								<Item.Title class="break-all">
									{container.image}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{#if baseRefs.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Templates</Item.Title>
						<Item.Description>spec.baseRefs</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each baseRefs as baseRef, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>Base Reference</Item.Description>
								<Item.Title class="break-all">
									{baseRef.name}
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
