<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Grid from '@lucide/svelte/icons/grid';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Network from '@lucide/svelte/icons/network';
	import Shield from '@lucide/svelte/icons/shield';
	import Users from '@lucide/svelte/icons/users';
	import Zap from '@lucide/svelte/icons/zap';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { InstantVector, PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { typographyVariants } from '$lib/components/typography/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import { cn } from '$lib/utils';

	let { object }: { object: TenantOtterscaleIoV1Alpha1Workspace } = $props();

	let resourceQuotaUsed: Record<string, string> = $state({});
	let isLoaded = $state(false);

	const K8S_QUANTITY_RE = /^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E|m)?$/;
	const K8S_MULTIPLIERS: Record<string, number> = {
		'': 1,
		m: 0.001,
		k: 1e3,
		M: 1e6,
		G: 1e9,
		T: 1e12,
		P: 1e15,
		E: 1e18,
		Ki: 1024,
		Mi: 1024 ** 2,
		Gi: 1024 ** 3,
		Ti: 1024 ** 4,
		Pi: 1024 ** 5,
		Ei: 1024 ** 6
	};

	function parseK8sQuantity(raw: string | number): number {
		if (typeof raw === 'number') return raw;
		const match = raw.match(K8S_QUANTITY_RE);
		if (!match) return NaN;
		return parseFloat(match[1]) * (K8S_MULTIPLIERS[match[2] ?? ''] ?? 1);
	}

	function formatResourceValue(key: string, value: number): string {
		if (key.includes('cpu')) {
			return value < 1 ? `${Math.round(value * 1000)}m` : `${value}`;
		}
		if (key.includes('memory')) {
			const gi = value / 1024 ** 3;
			if (gi >= 1) return `${Math.round(gi * 10) / 10}Gi`;
			const mi = value / 1024 ** 2;
			if (mi >= 1) return `${Math.round(mi)}Mi`;
			return `${Math.round(value / 1024)}Ki`;
		}
		if (key.includes('gpumem')) {
			const gi = value / 1024;
			return `${Math.round(gi * 10) / 10}Gi`;
		}
		return String(Math.round(value));
	}

	function formatHardValue(key: string, raw: string | number): string {
		if (!key.includes('gpumem')) return String(raw);
		if (typeof raw === 'string' && !K8S_QUANTITY_RE.test(raw)) return raw;
		const base = parseK8sQuantity(raw);
		if (Number.isNaN(base)) return String(raw);
		const gi = base / 1024;
		return `${Math.round(gi * 10) / 10}Gi`;
	}

	async function fetchResourceQuotaMetrics() {
		const namespace = object.status?.resourceQuotaRef?.namespace ?? '';
		if (!namespace) return;

		const prometheusDriver = new PrometheusDriver({
			endpoint: `/proxy/${page.params.cluster}/prometheus`,
			baseURL: '/api/v1',
			headers: { 'x-proxy-target': 'api' }
		});

		try {
			const gpuResourceMap: Record<string, string> = {
				nvidia_com_gpu: 'nvidia.com/gpu',
				nvidia_com_gpumem: 'nvidia.com/gpumem'
			};

			const [limitsResponse, requestsResponse] = await Promise.all([
				prometheusDriver.instantQuery(
					`sum by (resource) (kube_pod_container_resource_limits{namespace="${namespace}"} and on (namespace, pod) kube_pod_container_status_ready{namespace="${namespace}"} == 1)`
				),
				prometheusDriver.instantQuery(
					`sum by (resource) (kube_pod_container_resource_requests{namespace="${namespace}"} and on (namespace, pod) kube_pod_container_status_ready{namespace="${namespace}"} == 1)`
				)
			]);

			const usedMap: Record<string, string> = {};
			for (const v of limitsResponse.result as InstantVector[]) {
				const metricResource = (v.metric.labels as Record<string, string>).resource;
				if (!metricResource) continue;
				const quotaResource = gpuResourceMap[metricResource] ?? metricResource;
				usedMap[`limits.${quotaResource}`] = formatResourceValue(
					`limits.${quotaResource}`,
					v.value.value
				);
			}
			for (const v of requestsResponse.result as InstantVector[]) {
				const metricResource = (v.metric.labels as Record<string, string>).resource;
				if (!metricResource) continue;
				const quotaResource = gpuResourceMap[metricResource] ?? metricResource;
				usedMap[`requests.${quotaResource}`] = formatResourceValue(
					`requests.${quotaResource}`,
					v.value.value
				);
				if (gpuResourceMap[metricResource]) {
					usedMap[quotaResource] = formatResourceValue(quotaResource, v.value.value);
				}
			}
			resourceQuotaUsed = usedMap;
		} catch (error) {
			console.error('Failed to fetch ResourceQuota metrics from Prometheus:', error);
		}
	}

	onMount(async () => {
		await fetchResourceQuotaMetrics();
		isLoaded = true;
	});

	function getGridLayout(key: string) {
		if (key === 'limits.cpu') return 'md:row-start-1 2xl:row-start-1';
		if (key === 'limits.memory') return 'md:row-start-2 2xl:row-start-1';
		if (key === 'nvidia.com/gpu') return 'md:row-start-3 2xl:row-start-1';
		if (key === 'nvidia.com/gpumem') return 'md:row-start-4 2xl:row-start-1';

		if (key === 'requests.cpu') return 'md:row-start-1 2xl:row-start-2';
		if (key === 'requests.memory') return 'md:row-start-2 2xl:row-start-2';

		return '2xl:row-start-3 md:row-start-5';
	}

	let isResourceQuotasGrid = $state(false);

	type RelatedResource = {
		name: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
	};

	let relatedResources = $derived.by(() => {
		const refs: RelatedResource[] = [];
		const status = object?.status;
		if (!status) return refs;

		const singleRefs: {
			ref: typeof status.namespaceRef;
			group: string;
			version: string;
			kind: string;
			resource: string;
		}[] = [
			{
				ref: status.namespaceRef,
				group: '',
				version: 'v1',
				kind: 'Namespace',
				resource: 'namespaces'
			},
			{
				ref: status.resourceQuotaRef,
				group: '',
				version: 'v1',
				kind: 'ResourceQuota',
				resource: 'resourcequotas'
			},
			{
				ref: status.configMapRef,
				group: '',
				version: 'v1',
				kind: 'ConfigMap',
				resource: 'configmaps'
			},
			{
				ref: status.limitRangeRef,
				group: '',
				version: 'v1',
				kind: 'LimitRange',
				resource: 'limitranges'
			},
			{
				ref: status.networkPolicyRef,
				group: 'networking.k8s.io',
				version: 'v1',
				kind: 'NetworkPolicy',
				resource: 'networkpolicies'
			},
			{
				ref: status.helmRepositoryRef as { [k: string]: unknown; name: string; namespace?: string },
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				kind: 'HelmRepository',
				resource: 'helmrepositories'
			},
			{
				ref: status.imagePullSecretRef as {
					[k: string]: unknown;
					name: string;
					namespace?: string;
				},
				group: '',
				version: 'v1',
				kind: 'Secret',
				resource: 'secrets'
			}
		];

		for (const { ref, group, version, kind, resource } of singleRefs) {
			if (ref?.name) {
				refs.push({ name: ref.name, group, version, kind, resource });
			}
		}

		for (const roleBindingRef of status.roleBindingRefs ?? []) {
			if (roleBindingRef.name) {
				refs.push({
					name: roleBindingRef.name,
					group: 'rbac.authorization.k8s.io',
					version: 'v1',
					kind: 'RoleBinding',
					resource: 'rolebindings'
				});
			}
		}

		return refs;
	});
</script>

{#if !isLoaded}
	<Field.Group class="pb-8">
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
	<Field.Group class="pb-8">
		<!-- Spec Section -->
		<Field.Set>
			<!-- Status Conditions -->
			<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
				{@const conditions = object.status?.conditions ?? []}
				{@const readyCondition = conditions.find((condition) => condition.type === 'Ready')}
				{@const isReady = readyCondition?.status === 'True' ? true : false}
				<Card.Header>
					<Card.Title>
						<Item.Root class="p-0">
							<Item.Media>
								<HeartPulse size={20} />
							</Item.Media>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>Status</Item.Title>
							</Item.Content>
						</Item.Root>
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if conditions.length > 0}
						{#if isReady}
							<Item.Root class={cn('p-0', !isReady ? '**:text-destructive' : '**:text-none')}>
								<Item.Content>
									<Item.Title class={typographyVariants({ variant: 'h6' })}>
										{readyCondition?.reason}
									</Item.Title>
									<Item.Description>{readyCondition?.message}</Item.Description>
								</Item.Content>
							</Item.Root>
						{:else}
							{#each [...conditions].sort((p, n) => {
								const previous = new Date(p.lastTransitionTime ?? 0).getTime();
								const next = new Date(n.lastTransitionTime ?? 0).getTime();
								return next - previous;
							}) as condition, index (index)}
								<Item.Root
									class={cn(
										'p-0',
										condition.status === 'False' ? '**:text-destructive' : '**:text-none'
									)}
								>
									<Item.Content>
										<Item.Title class={typographyVariants({ variant: 'h6' })}>
											{condition?.reason}
										</Item.Title>
										<Item.Description>{condition?.message}</Item.Description>
									</Item.Content>
								</Item.Root>
							{/each}
						{/if}
					{:else}
						<Empty.Root class="h-full">
							<Empty.Header>
								<Empty.Media variant="icon">
									<HeartPulse />
								</Empty.Media>
								<Empty.Title>No Status Available</Empty.Title>
								<Empty.Description>
									There are no status conditions to display for this workspace.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Resource Quota -->
			<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
				{@const resourceQuotaHard = object.spec?.resourceQuota?.hard ?? {}}
				<Card.Header>
					<Card.Title>
						<Item.Root class="p-0">
							<Item.Media>
								<Gauge size={20} />
							</Item.Media>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>Resource Quota</Item.Title
								>
							</Item.Content>
							<Item.Actions>
								<Toggle
									aria-label="Toggle Resource Quota Grid"
									size="sm"
									onclick={() => {
										isResourceQuotasGrid = !isResourceQuotasGrid;
									}}
									class="data-[state=on]:*:[svg]:fill-muted-foreground/50"
								>
									<Grid />
								</Toggle>
							</Item.Actions>
						</Item.Root>
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if Object.keys(resourceQuotaHard).length > 0}
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
							{#each Object.keys(resourceQuotaHard) as key, index (index)}
								<Item.Root
									class={cn('w-fit p-0', isResourceQuotasGrid ? getGridLayout(key) : 'flex')}
								>
									<Item.Content class="flex gap-2">
										<Item.Description>
											{key}
										</Item.Description>
										<Item.Title class={cn(typographyVariants({ variant: 'large' }))}>
											{resourceQuotaUsed[key] !== undefined
												? resourceQuotaUsed[key]
												: '?'}/{formatHardValue(key, resourceQuotaHard[key])}
										</Item.Title>
									</Item.Content>
								</Item.Root>
							{/each}
						</div>
					{:else}
						<Empty.Root class="h-full">
							<Empty.Header>
								<Empty.Media variant="icon">
									<Gauge />
								</Empty.Media>
								<Empty.Title>No Resource Quota Configured</Empty.Title>
								<Empty.Description>
									Resource Quota is not configured yet. Please click the edit button at the top
									right to configure Resource Quota.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Limit Range -->
			<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
				{@const limits = object.spec?.limitRange?.limits ?? []}
				<Card.Header>
					<Card.Title>
						<Item.Root class="p-0">
							<Item.Media>
								<Zap size={20} />
							</Item.Media>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>Limit Range</Item.Title>
							</Item.Content>
						</Item.Root>
					</Card.Title>
				</Card.Header>
				<Card.Content class="h-full ">
					{#if limits.length > 0}
						{#each limits as limit, index (index)}
							{@const { type, ...thresholds } = limit}
							<Item.Root class="justify-between py-0 pl-0">
								<Item.Content>
									<Item.Title class="uppercase">
										{type}
									</Item.Title>
								</Item.Content>
								<Item.Footer
									class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
								>
									{#each Object.entries(thresholds) as [key, values], index (index)}
										{#if values && typeof values === 'object'}
											<Item.Root class="p-0">
												<Item.Content>
													<Item.Title
														class={cn('capitalize', typographyVariants({ variant: 'muted' }))}
													>
														{key}
													</Item.Title>
													<Item.Description>
														{#each Object.entries(values) as [key, value], index (index)}
															<p class="font-mono text-primary">{key}:{value}</p>
														{/each}
													</Item.Description>
												</Item.Content>
											</Item.Root>
										{/if}
									{/each}
								</Item.Footer>
							</Item.Root>
							<Separator class="my-2 last:hidden" />
						{/each}
					{:else}
						<Empty.Root class="h-full">
							<Empty.Header>
								<Empty.Media variant="icon">
									<Zap />
								</Empty.Media>
								<Empty.Title>No Limit Range Configured</Empty.Title>
								<Empty.Description>
									Limit Range is not configured yet. Please click the edit button at the top right
									to configure Limit Range.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Network Isolation -->
			<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
				<Card.Header>
					<Card.Title>
						<Item.Root class="p-0">
							<Item.Media>
								<Shield size={20} />
							</Item.Media>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>
									Network Isolation
								</Item.Title>
							</Item.Content>
						</Item.Root>
					</Card.Title>
				</Card.Header>
				<Card.Content class="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<Item.Root class="flex w-full items-center justify-between p-0">
						<Item.Content>
							<Item.Title class={typographyVariants({ variant: 'h6' })}>Enabled</Item.Title>
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
							<Item.Title class={typographyVariants({ variant: 'h6' })}>
								Allowed Namespaces
							</Item.Title>
							<Item.Description>
								{#if allowedNamespaces.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each allowedNamespaces as allowedNamespace, index (index)}
											<Badge variant="secondary" class={typographyVariants({ variant: 'muted' })}>
												<Network class="size-3" />
												{allowedNamespace}
											</Badge>
										{/each}
									</div>
								{:else}
									<Badge variant="outline" class={typographyVariants({ variant: 'muted' })}>
										<Network class="size-3" />
										<p class="italic">No namespaces allowed</p>
									</Badge>
								{/if}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<Badge>{allowedNamespaces.length}</Badge>
						</Item.Actions>
					</Item.Root>
				</Card.Content>
			</Card.Root>

			<!-- Members -->
			<Card.Root class="flex h-full flex-col border-0 bg-muted/50 shadow-none">
				{@const members = object.spec?.members ?? []}
				<Card.Header>
					<Card.Title>
						<Item.Root class="p-0">
							<Item.Media>
								<Users size={20} />
							</Item.Media>
							<Item.Content>
								<Item.Title class={typographyVariants({ variant: 'h6' })}>Members</Item.Title>
							</Item.Content>
						</Item.Root>
					</Card.Title>
					<Card.Action>
						<Badge>{members.length}</Badge>
					</Card.Action>
				</Card.Header>
				<Card.Content class="flex flex-wrap gap-8">
					<!-- Members must more than one -->
					{#if members.length > 0}
						{#each members as member, index (index)}
							<Item.Root class="p-0" size="sm">
								<Item.Content>
									<Item.Title>
										{member.name}
										<Badge>{member.role}</Badge>
										{#if member.serviceAccount}
											<Badge variant="destructive">service account</Badge>
										{/if}
									</Item.Title>
									<Item.Description>
										<span>{member.username}</span>
										<br />
										<span> {member.subject}</span>
									</Item.Description>
								</Item.Content>
							</Item.Root>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>
		</Field.Set>

		<Field.Set>
			<!-- Related Resources -->
			<Label class={typographyVariants({ variant: 'h4' })}>Related Resources</Label>
			{#if relatedResources.length > 0}
				<div class="grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">
					{#each relatedResources as ref (ref.kind + ref.name)}
						<Item.Root variant="outline">
							{#snippet child({ props })}
								{@const ns = object.status?.namespaceRef?.name ?? ''}
								{@const url = resolve(
									`/(auth)/${page.params.cluster}/${page.params.workspace}/${ref.name}?group=${ref.group}&version=${ref.version}&kind=${ref.kind}&resource=${ref.resource}&namespace=${ns}`
								)}
								<a href={url} target="_blank" rel="noopener noreferrer" {...props}>
									<Item.Content>
										<Item.Title>{ref.name}</Item.Title>
										<Item.Description>
											{ref.resource}.{ref.group ? `${ref.group}/${ref.version}` : ref.version}
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
