<script lang="ts" module>
	type WorkspaceMember = NonNullable<TenantOtterscaleIoV1Alpha1Workspace['spec']>['members'][number];
</script>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Box from '@lucide/svelte/icons/box';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import Gauge from '@lucide/svelte/icons/gauge';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Network from '@lucide/svelte/icons/network';
	import Shield from '@lucide/svelte/icons/shield';
	import Users from '@lucide/svelte/icons/users';
	import Zap from '@lucide/svelte/icons/zap';
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
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils';

	let { object }: { object: TenantOtterscaleIoV1Alpha1Workspace } = $props();

	const abortController = new AbortController();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let resourceQuotaUsed: Record<string, string> = $state({});
	let isLoaded = $state(false);

	function formatHardValue(key: string, raw: string | number): string {
		if (!key.includes('gpumem')) return String(raw);
		try {
			// gpumem hard quota is expressed in Mi, matching quantity-cell.svelte's baseUnit convention
			const bytes = BigInt(quantityToScalar(String(raw))) * binarySuffixFactors.Mi;
			const { value, unit } = formatWithBinarySuffix(bytes);
			return `${Math.round(value * 10) / 10}${unit}`;
		} catch {
			return String(raw);
		}
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
	const members = $derived(object.spec?.members ?? []);
	const visibleMembers = $derived(
		showAllMembers ? members : members.slice(0, MEMBERS_COLLAPSED_LIMIT)
	);
	function getMemberLabel(member: WorkspaceMember): string {
		return member.name || member.username || member.subject;
	}
	function getMemberRoleVariant(role: WorkspaceMember['role']) {
		if (role === 'admin') return 'default' as const;
		if (role === 'edit') return 'secondary' as const;
		return 'outline' as const;
	}

	type RelatedResource = {
		name: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespaced: boolean;
	};

	let relatedResources = $derived.by(() => {
		const relatedResources: RelatedResource[] = [];
		const status = object?.status;
		if (!status) return relatedResources;

		const relatedResourceReference: {
			reference: typeof status.namespaceRef;
			group: string;
			version: string;
			kind: string;
			resource: string;
			namespaced: boolean;
		}[] = [
			{
				reference: status.namespaceRef,
				group: '',
				version: 'v1',
				kind: 'Namespace',
				resource: 'namespaces',
				namespaced: false
			},
			{
				reference: status.resourceQuotaRef,
				group: '',
				version: 'v1',
				kind: 'ResourceQuota',
				resource: 'resourcequotas',
				namespaced: true
			},
			{
				reference: status.configMapRef as {
					[k: string]: unknown;
					name: string;
					namespace?: string;
				},
				group: '',
				version: 'v1',
				kind: 'ConfigMap',
				resource: 'configmaps',
				namespaced: true
			},
			{
				reference: status.limitRangeRef,
				group: '',
				version: 'v1',
				kind: 'LimitRange',
				resource: 'limitranges',
				namespaced: true
			},
			{
				reference: status.networkPolicyRef,
				group: 'networking.k8s.io',
				version: 'v1',
				kind: 'NetworkPolicy',
				resource: 'networkpolicies',
				namespaced: true
			},
			{
				reference: status.helmRepositoryRef as {
					[k: string]: unknown;
					name: string;
					namespace?: string;
				},
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				kind: 'HelmRepository',
				resource: 'helmrepositories',
				namespaced: true
			},
			{
				reference: status.imagePullSecretRef as {
					[k: string]: unknown;
					name: string;
					namespace?: string;
				},
				group: '',
				version: 'v1',
				kind: 'Secret',
				resource: 'secrets',
				namespaced: true
			},
			...(status?.roleBindingRefs ?? []).map((roleBindingRef) => ({
				reference: roleBindingRef,
				group: 'rbac.authorization.k8s.io',
				version: 'v1',
				kind: 'RoleBinding',
				resource: 'rolebindings',
				namespaced: true
			}))
		];

		for (const {
			reference,
			group,
			version,
			kind,
			resource,
			namespaced
		} of relatedResourceReference) {
			if (reference?.name) {
				relatedResources.push({ name: reference.name, group, version, kind, resource, namespaced });
			}
		}

		return relatedResources;
	});
</script>

{#if !isLoaded}
	<Field.Group>
		<Field.Set>
			{#each Array(13).keys() as index (index)}
				{#if index % 2 === 0}
					{#if index % 3 !== 0}
						{#if index % 5 === 0}
							{#if index % 7 !== 0}
								{#if index % 11 === 0}
									<Skeleton class="h-1 w-full" />
								{:else}
									<Skeleton class="h-11 w-5/6" />
								{/if}
							{:else}
								<Skeleton class="h-7 w-4/5" />
							{/if}
						{:else}
							<Skeleton class="h-5 w-3/4" />
						{/if}
					{:else}
						<Skeleton class="h-3 w-2/3" />
					{/if}
				{:else}
					<Skeleton class="h-2 w-1/2" />
				{/if}
			{/each}
		</Field.Set>
	</Field.Group>
{:else}
	<Field.Group>
		<!-- Status Conditions -->
		<Field.Set>
			{@const conditions = object.status?.conditions ?? []}
			{#if conditions.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Status</Item.Title>
					<Item.Description>conditions</Item.Description>
				</Item.Content>
			</Item.Root>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
					{#each conditions as condition, index (index)}
						{#if condition.status === 'True'}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title >
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
							<Item.Root class="p-0">
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

		<!-- Resource Quota -->
		<Field.Set>
			{@const resourceQuotaHard = object.spec?.resourceQuota?.hard ?? {}}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Resource Quota</Item.Title>
					<Item.Description>used/hard</Item.Description>
				</Item.Content>
			</Item.Root>
			{#if Object.keys(resourceQuotaHard).length > 0}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					{#each Object.keys(resourceQuotaHard) as key, index (index)}
						<Item.Root class="w-fit p-0">
							<Item.Content class="flex gap-2">
								<Item.Description>
									{key}
								</Item.Description>
								<Item.Title>
									{resourceQuotaUsed[key] !== undefined
										? formatHardValue(key, resourceQuotaUsed[key])
										: '-'}/{formatHardValue(key, resourceQuotaHard[key])}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
			{/if}
		</Field.Set>

		<!-- Limit Range -->
		<Field.Set>
			{@const limits = object.spec?.limitRange?.limits ?? []}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Limit Range</Item.Title>
					<Item.Description>limits</Item.Description>
				</Item.Content>
			</Item.Root>
			{#if limits.length > 0}
				{#each limits as limit, index (index)}
					{@const { type, ...thresholds } = limit}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						{#each Object.entries(thresholds) as [thresholdKey, values], index (index)}
							{#if values && typeof values === 'object'}
								{#each Object.entries(values) as [resourceKey, value], index (index)}
									<Item.Root class="w-fit p-0">
										<Item.Content class="gap-2">
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
					</div>
				{/each}
			{/if}
		</Field.Set>

		<!-- Network Isolation -->
		<Field.Set>
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Network Isolation</Item.Title>
					<Item.Description>isolation settings</Item.Description>
				</Item.Content>
			</Item.Root>
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<Item.Root class="flex w-full items-center justify-between p-0">
					<Item.Content>
						<Item.Title>Enabled</Item.Title>
						<Item.Description>
							{@const enabled = object.spec?.networkIsolation?.enabled ?? null}
							{#if enabled === true}
								<CircleCheck size={40} class="text-chart-2" />
							{:else}
								<CircleX size={40} class="text-destructive" />
							{/if}
						</Item.Description>
					</Item.Content>
				</Item.Root>
				<Item.Root class="p-0">
					{@const allowedNamespaces = object.spec?.networkIsolation?.allowedNamespaces ?? []}
					<Item.Content>
						<Item.Title>Allowed Namespaces</Item.Title>
						<Item.Description>
							{#if allowedNamespaces.length > 0}
								<div class="flex flex-wrap gap-1">
									{#each allowedNamespaces as allowedNamespace, index (index)}
										<Badge variant="secondary">
											<Network class="size-3" />
											{allowedNamespace}
										</Badge>
									{/each}
								</div>
							{:else}
								<Badge variant="outline">
									<Network class="size-3" />
									<p class="italic">No namespaces allowed</p>
								</Badge>
							{/if}
						</Item.Description>
					</Item.Content>
				</Item.Root>
			</div>
		</Field.Set>

		<!-- Members -->
		<Field.Set>
			<Item.Root class="p-0">
				<Item.Media>
					<Users size={20} />
				</Item.Media>
				<Item.Content>
					<Item.Title>Members</Item.Title>
				</Item.Content>
			</Item.Root>
			{#if members.length === 0}
				<Empty.Root class="h-full">
					<Empty.Header>
						<Empty.Media variant="icon">
							<Users />
						</Empty.Media>
						<Empty.Title>No Members</Empty.Title>
						<Empty.Description>
							No members have been granted access to this workspace yet.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<div class="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 2xl:grid-cols-3">
					{#each visibleMembers as member (member.subject)}
						<Item.Root class="p-0" size="sm">
							<Item.Content class="min-w-0">
								<Item.Title class="w-full justify-between">
									<span class="truncate">{getMemberLabel(member)}</span>
									<span class="flex shrink-0 items-center gap-2">
										{#if member.serviceAccount}
											<Badge variant="destructive">service account</Badge>
										{/if}
										<Badge variant={getMemberRoleVariant(member.role)}>{member.role}</Badge>
									</span>
								</Item.Title>
								{#if member.username}
									<Item.Description class="truncate font-mono">{member.username}</Item.Description>
								{/if}
							</Item.Content>
						</Item.Root>
					{/each}
				</div>
				{#if members.length > MEMBERS_COLLAPSED_LIMIT}
					<div class="flex justify-center">
						<Button variant="ghost" size="sm" onclick={() => (showAllMembers = !showAllMembers)}>
							{showAllMembers ? 'Show less' : `Show all ${members.length}`}
						</Button>
					</div>
				{/if}
			{/if}
		</Field.Set>

		{@const namespace = object.status?.namespaceRef?.name ?? ''}
		<Field.Set>
			{#if relatedResources.length > 0}
				<!-- Related Resources -->
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Related Resources</Item.Title>
						<Item.Description>
							{relatedResources.length} resources related to {object.kind}
							{object.metadata?.name}
						</Item.Description>
					</Item.Content>
				</Item.Root>

				<div class="grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">
					{#each relatedResources as relatedResource (relatedResource.kind + relatedResource.name)}
						{#if !relatedResource.namespaced || (relatedResource.namespaced && namespace)}
							<Item.Root variant="outline">
								{#snippet child({ props })}
									{@const urlSearchParameters = new URLSearchParams({
										group: relatedResource.group,
										version: relatedResource.version,
										kind: relatedResource.kind,
										resource: relatedResource.resource,
										...(relatedResource.namespaced ? { namespace: namespace } : {})
									})}
									{@const url = resolve(
										`/(auth)/${page.params.cluster}/${page.params.workspace}/${relatedResource.name}?${urlSearchParameters}`
									)}
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
			{:else}
				<Empty.Root class="h-full">
					<Empty.Header>
						<Empty.Media variant="icon">
							<Box />
						</Empty.Media>
						<Empty.Title>No Related Resources</Empty.Title>
						<Empty.Description>
							There are no related resources to display for this workspace.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Field.Set>
	</Field.Group>
{/if}
