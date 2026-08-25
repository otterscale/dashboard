<script lang="ts" module>
	type WorkspaceMember = NonNullable<
		TenantOtterscaleIoV1Alpha1Workspace['spec']
	>['members'][number];
</script>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { type GetRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1ResourceQuota, TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		binarySuffixFactors,
		formatWithBinarySuffix,
		quantityToScalar
	} from '$lib/components/dynamic-table/utils';
	import { Badge } from '$lib/components/ui/badge';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { object }: { object: TenantOtterscaleIoV1Alpha1Workspace } = $props();

	const abortController = new AbortController();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let resourceQuotaUsed: Record<string, string> = $state({});
	let isLoaded = $state(false);

	function formatQuantity(bytes: bigint): string {
		const { value, unit } = formatWithBinarySuffix(bytes);
		return `${Math.round(value * 10) / 10}${unit}`;
	}

	async function fetchResourceQuota() {
		const namespace = object.status?.resourceQuotaRef?.namespace ?? '';
		const name = object.status?.resourceQuotaRef?.name ?? '';
		if (!namespace || !name) return;

		try {
			const response = await resourceClient.get(
				{
					cluster: page.params.cluster,
					namespace,
					name,
					group: '',
					version: 'v1',
					resource: 'resourcequotas'
				} as GetRequest,
				{ signal: abortController.signal }
			);
			const resourceQuota = response.object as CoreV1ResourceQuota | undefined;
			resourceQuotaUsed = resourceQuota?.status?.used ?? {};
		} catch (error) {
			console.error('Failed to fetch ResourceQuota status:', error);
		}
	}

	onMount(async () => {
		await fetchResourceQuota();
		isLoaded = true;
	});

	onDestroy(() => {
		abortController.abort();
	});

	// Above this count the member list collapses behind a "Show all" toggle so the
	// card doesn't grow unbounded with the member count.
	const MEMBERS_COLLAPSED_LIMIT = 6;
	let showAllMembers = $state(false);
	function getMemberLabel(member: WorkspaceMember): string {
		return member.name || member.username || member.subject;
	}
	function getMemberRoleVariant(role: WorkspaceMember['role']) {
		if (role === 'admin') return 'default' as const;
		if (role === 'edit') return 'secondary' as const;
		return 'outline' as const;
	}

	type RelatedResource = {
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespaced: boolean;
		name: string;
	};

	type ResourceReference = { name?: string; namespace?: string };

	const statusResourceReferenceIdentifiers = {
		namespaceRef: {
			group: '',
			version: 'v1',
			kind: 'Namespace',
			resource: 'namespaces',
			namespaced: false
		},
		resourceQuotaRef: {
			group: '',
			version: 'v1',
			kind: 'ResourceQuota',
			resource: 'resourcequotas',
			namespaced: true
		},
		configMapRef: {
			group: '',
			version: 'v1',
			kind: 'ConfigMap',
			resource: 'configmaps',
			namespaced: true
		},
		limitRangeRef: {
			group: '',
			version: 'v1',
			kind: 'LimitRange',
			resource: 'limitranges',
			namespaced: true
		},
		networkPolicyRef: {
			group: 'networking.k8s.io',
			version: 'v1',
			kind: 'NetworkPolicy',
			resource: 'networkpolicies',
			namespaced: true
		},
		helmRepositoryRef: {
			group: 'source.toolkit.fluxcd.io',
			version: 'v1',
			kind: 'HelmRepository',
			resource: 'helmrepositories',
			namespaced: true
		},
		imagePullSecretRef: {
			group: '',
			version: 'v1',
			kind: 'Secret',
			resource: 'secrets',
			namespaced: true
		},
		roleBindingRefs: {
			group: 'rbac.authorization.k8s.io',
			version: 'v1',
			kind: 'RoleBinding',
			resource: 'rolebindings',
			namespaced: true
		}
	};

	let relatedResources = $derived.by(() => {
		const status = (object.status ?? {}) as Record<
			string,
			ResourceReference | ResourceReference[] | undefined
		>;

		return Object.entries(statusResourceReferenceIdentifiers).flatMap(([key, identifier]) => {
			const reference = status[key];
			return (Array.isArray(reference) ? reference : [reference]).flatMap((ref) =>
				ref?.name ? [{ ...identifier, name: ref.name } satisfies RelatedResource] : []
			);
		});
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
	<Field.Group class="space-y-4 *:gap-4">
		<Field.Set>
			{@const conditions = object.status?.conditions ?? []}
			{#if conditions.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Status</Item.Title>
						<Item.Description>status.conditions</Item.Description>
					</Item.Content>
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
			{@const resourceQuotaHard = object.spec?.resourceQuota?.hard ?? {}}
			{#if Object.keys(resourceQuotaHard).length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Resource Quota</Item.Title>
						<Item.Description>spec.resourceQuota.used/spec.resourceQuota.hard</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each Object.keys(resourceQuotaHard) as key, index (index)}
						{@const keyResourceQuotaUsed = resourceQuotaUsed[key]}
						{@const keyResourceQuotaUsedMultiplication =
							key === 'gpumem' ? binarySuffixFactors.Mi : BigInt(1)}
						{@const keyResourceQuotaHard = resourceQuotaHard[key]}
						{@const numerator =
							keyResourceQuotaUsed !== undefined
								? formatQuantity(
										BigInt(quantityToScalar(String(keyResourceQuotaUsed))) *
											keyResourceQuotaUsedMultiplication
									)
								: ' - '}
						{@const denominator = formatQuantity(
							BigInt(quantityToScalar(String(keyResourceQuotaHard)))
						)}
						<Item.Root>
							<Item.Content>
								<Item.Description>
									{key}
								</Item.Description>
								<Item.Title>
									{numerator}/{denominator}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{@const limits = object.spec?.limitRange?.limits ?? []}
			{#if limits.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Limit Range</Item.Title>
						<Item.Description>spec.limitRange.limits</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each limits as limit, index (index)}
						{@const { type, ...thresholds } = limit}
						{#each Object.entries(thresholds) as [thresholdKey, values], index (index)}
							{#if values && typeof values === 'object'}
								{#each Object.entries(values) as [resourceKey, value], index (index)}
									<Item.Root>
										<Item.Content>
											<Item.Description>
												{type}.{thresholdKey}.{resourceKey}
											</Item.Description>
											<Item.Title>
												{value}
											</Item.Title>
										</Item.Content>
									</Item.Root>
								{/each}
							{/if}
						{/each}
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{@const members = object.spec?.members ?? []}
			{#if members.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Members</Item.Title>
						<Item.Description>spec.members</Item.Description>
					</Item.Content>
					{#if members.length > MEMBERS_COLLAPSED_LIMIT}
						<Item.Actions>
							<Button variant="ghost" onclick={() => (showAllMembers = !showAllMembers)}>
								{showAllMembers ? 'less' : 'all'}
							</Button>
						</Item.Actions>
					{/if}
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 md:grid-cols-3">
					{#each members.slice(0, MEMBERS_COLLAPSED_LIMIT) as member (member.subject)}
						<Item.Root>
							<Item.Content>
								<Item.Title>
									{getMemberLabel(member)}
								</Item.Title>
								{#if member.username}
									<Item.Description>{member.username}</Item.Description>
								{/if}
							</Item.Content>
							<Item.Actions>
								{#if member.serviceAccount}
									<Badge variant="destructive">service account</Badge>
								{/if}
								<Badge variant={getMemberRoleVariant(member.role)}>{member.role}</Badge>
							</Item.Actions>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{@const allowedNamespaces = object.spec?.networkIsolation?.allowedNamespaces ?? []}
			{@const enabled = object.spec?.networkIsolation?.enabled ?? null}
			{#if allowedNamespaces.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Network Isolation</Item.Title>
						<Item.Description>spec.networkIsolation</Item.Description>
					</Item.Content>
					<Item.Actions>
						<Badge variant="outline">
							{enabled ? 'enabled' : 'disabled'}
						</Badge>
					</Item.Actions>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 rounded-lg bg-muted p-0 lg:grid-cols-3">
					{#each allowedNamespaces as allowedNamespace, index (index)}
						<Item.Root>
							<Item.Content>
								<Item.Description>Allowed Namespace</Item.Description>
								<Item.Title>
									{allowedNamespace}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>
		<Field.Set>
			{@const namespace = object.status?.namespaceRef?.name ?? ''}
			{#if relatedResources.length > 0}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Related Resources</Item.Title>
						<Item.Description>
							{relatedResources.length} related resources
						</Item.Description>
					</Item.Content>
				</Item.Root>
				<div class="min-h-xl grid grid-cols-1 gap-4 p-0 lg:grid-cols-3">
					{#each relatedResources as relatedResource, index (index)}
						{@const urlSearchParameters = new URLSearchParams({
							group: relatedResource.group,
							version: relatedResource.version,
							kind: relatedResource.kind,
							resource: relatedResource.resource,
							...(relatedResource.namespaced ? { namespace: namespace } : {}),
							query: `Name:${relatedResource.name}`
						})}
						{@const url = resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}?${urlSearchParameters}`
						)}
						{#if !relatedResource.namespaced || (relatedResource.namespaced && namespace)}
							<Item.Root variant="outline">
								{#snippet child({ props })}
									<a href={url} target="_blank" rel="noopener noreferrer" {...props}>
										<Item.Content>
											<Item.Title>{relatedResource.name}</Item.Title>
											<Item.Description>
												{relatedResource.resource}.{relatedResource.group
													? `${relatedResource.group}/${relatedResource.version}`
													: relatedResource.version}
											</Item.Description>
										</Item.Content>
										<Item.Actions>
											<ExternalLinkIcon class="size-4" />
										</Item.Actions>
									</a>
								{/snippet}
							</Item.Root>
						{/if}
					{/each}
				</div>
			{/if}
		</Field.Set>
	</Field.Group>
{/if}
