<script lang="ts">
	import 'driver.js/dist/driver.css';

	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BracesIcon from '@lucide/svelte/icons/braces';
	import CircleQuestionMarkIcon from '@lucide/svelte/icons/circle-question-mark';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import ContainerIcon from '@lucide/svelte/icons/container';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import UserStarIcon from '@lucide/svelte/icons/user-star';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onMount, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import {
		DialogAbout,
		NavMain,
		NavSecondary,
		NavUser,
		startTour,
		WorkspaceSwitcher
	} from '$lib/components/layout';
	import Registe from '$lib/components/layout/dialog-import-cluster.svelte';
	import RegisteClusterTrigger from '$lib/components/layout/registe-cluster-trigger.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';
	import { pulse } from '$lib/stores/pulse.svelte';
	import { getAdditionalItems } from '$lib/utils/features';

	import type { LayoutData } from './$types';

	let {
		data,
		children
	}: {
		data: LayoutData;
		children: Snippet;
	} = $props();

	const current = $derived($breadcrumbs.at(-1));

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const resourceClient = createClient(ResourceService, transport);

	let activeCluster = $state(page.params.cluster ?? '');
	let links = $state<Link[]>([]);
	let workspaces = $state<TenantOtterscaleIoV1Alpha1Workspace[]>([]);

	let sidebarOpen = $state(true);
	let aboutOpen = $state(false);
	let importOpen = $state(false);

	async function fetchClusters(signal?: AbortSignal): Promise<Link[]> {
		try {
			const response = await linkClient.listLinks({}, { signal });
			return response.links;
		} catch (error) {
			if (signal?.aborted) throw error;
			console.error('Failed to fetch links:', error);
			return [];
		}
	}

	async function fetchWorkspaces(
		cluster: string,
		signal?: AbortSignal
	): Promise<TenantOtterscaleIoV1Alpha1Workspace[]> {
		try {
			const response = await resourceClient.list(
				{
					cluster: cluster,
					group: 'tenant.otterscale.io',
					version: 'v1alpha1',
					resource: 'workspaces',
					labelSelector: 'user.otterscale.io/' + data.user.sub
				},
				{ signal }
			);
			return response.items.map((item) => item.object as TenantOtterscaleIoV1Alpha1Workspace);
		} catch (error) {
			if (signal?.aborted) throw error;
			console.error('Failed to fetch workspaces:', error);
			return [];
		}
	}

	async function onClusterChange(cluster: string) {
		const newWorkspaces = await fetchWorkspaces(cluster);
		const workspace = newWorkspaces[0]?.metadata?.name;

		if (workspace) {
			await goto(
				resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', { cluster, workspace })
			);
		} else {
			await goto(resolve('/(auth)/[cluster]/console', { cluster }));
		}

		workspaces = newWorkspaces;
		toast.success(m.switch_cluster({ name: cluster }));
	}

	let isMounted = $state(false);
	onMount(async () => {
		links = await fetchClusters();
		if (activeCluster) {
			workspaces = await fetchWorkspaces(activeCluster);
		}
		isMounted = true;
	});
	$effect(() => {
		if (pulse.workspaces === 0) return;

		if (!activeCluster) return;

		const abortController = new AbortController();
		fetchWorkspaces(activeCluster, abortController.signal)
			.then((resources) => {
				if (!abortController.signal.aborted) workspaces = resources;
			})
			.catch((err) => {
				if (!abortController.signal.aborted) console.error(err);
			});

		return () => abortController.abort();
	});
	$effect(() => {
		if (pulse.links === 0) return;

		if (!activeCluster) return;

		const abortController = new AbortController();
		fetchClusters(abortController.signal)
			.then((resources) => {
				if (!abortController.signal.aborted) links = resources;
			})
			.catch((err) => {
				if (!abortController.signal.aborted) console.error(err);
			});

		return () => abortController.abort();
	});

	function resourceUrl(options: {
		group: string;
		version: string;
		kind: string;
		resource: string;
		labelSelector?: string;
		fieldSelector?: string;
	}) {
		const { group, version, kind, resource, labelSelector, fieldSelector } = options;

		const workspace = page.params.workspace ?? '_';

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const urlSearchParameters = new URLSearchParams({ group, version, kind, resource });

		if (labelSelector) urlSearchParameters.set('labelSelector', labelSelector);
		if (fieldSelector) urlSearchParameters.set('fieldSelector', fieldSelector);

		return resolve(`/(auth)/${activeCluster}/${workspace}?${urlSearchParameters}`);
	}

	const navData = $derived({
		platform: [
			{
				title: m.overview(),
				url: page.params.workspace
					? resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', {
							cluster: activeCluster,
							workspace: page.params.workspace
						})
					: '',
				icon: CompassIcon
			},
			{
				title: m.dashboard(),
				icon: GaugeIcon,
				items: [
					{
						title: m.cluster(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/dashboard/cluster', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.model(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/dashboard/model', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.compute(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/dashboard/compute', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.storage(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/dashboard/storage', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					}
				]
			},
			{
				title: m.ai_studio(),
				icon: BotIcon,
				isActive: true,
				items: [
					{
						title: m.model_service(),
						url: resourceUrl({
							group: 'serving.kserve.io',
							version: 'v1alpha2',
							kind: 'LLMInferenceService',
							resource: 'llminferenceservices'
						})
					},
					{
						title: m.model_configuration(),
						url: resourceUrl({
							group: 'serving.kserve.io',
							version: 'v1alpha2',
							kind: 'LLMInferenceServiceConfig',
							resource: 'llminferenceserviceconfigs',
							fieldSelector: 'metadata.namespace!=kserve,metadata.namespace!=otterscale-system'
						})
					},
					{
						title: m.model_template(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/model-templates', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					}
				]
			},
			{
				title: m.apps(),
				icon: LayoutGridIcon,
				isActive: true,
				items: [
					{
						title: m.application_hub(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/hub', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.release(),
						url: resourceUrl({
							group: 'helm.toolkit.fluxcd.io',
							version: 'v2',
							kind: 'HelmRelease',
							resource: 'helmreleases'
						})
					},
					{
						title: m.repository(),
						url: resourceUrl({
							group: 'source.toolkit.fluxcd.io',
							version: 'v1',
							kind: 'HelmRepository',
							resource: 'helmrepositories'
						})
					}
				]
			},
			{
				title: m.workload(),
				icon: ContainerIcon,
				items: [
					{
						title: m.application(),
						url: resourceUrl({
							group: 'kro.run',
							version: 'v1alpha1',
							kind: 'Application',
							resource: 'applications'
						})
					},
					{
						title: m.schedule(),
						url: resourceUrl({
							group: 'kro.run',
							version: 'v1alpha1',
							kind: 'Schedule',
							resource: 'schedules'
						})
					},
					{
						title: m.task(),
						url: resourceUrl({
							group: 'kro.run',
							version: 'v1alpha1',
							kind: 'Task',
							resource: 'tasks'
						})
					}
				]
			},
			{
				title: m.compute(),
				icon: CpuIcon,
				items: [
					{
						title: m.virtual_machine(),
						url: resourceUrl({
							group: 'kubevirt.io',
							version: 'v1',
							kind: 'VirtualMachine',
							resource: 'virtualmachines'
						})
					},
					{
						title: m.data_volume(),
						url: resourceUrl({
							group: 'cdi.kubevirt.io',
							version: 'v1beta1',
							kind: 'DataVolume',
							resource: 'datavolumes'
						})
					},
					{
						title: m.instance_type(),
						url: resourceUrl({
							group: 'instancetype.kubevirt.io',
							version: 'v1beta1',
							kind: 'VirtualMachineInstancetype',
							resource: 'virtualmachineinstancetypes'
						})
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.object_storage(),
						url: resourceUrl({
							group: 'objectbucket.io',
							version: 'v1alpha1',
							kind: 'ObjectBucketClaim',
							resource: 'objectbucketclaims'
						})
					}
				]
			},
			...(data.isClusterAdmin
				? [
						{
							title: m.administration(),
							icon: UserStarIcon,
							items: [
								{
									title: m.workspace(),
									url: resourceUrl({
										group: 'tenant.otterscale.io',
										version: 'v1alpha1',
										kind: 'Workspace',
										resource: 'workspaces'
									})
								},
								{
									title: m.module(),
									url: page.params.workspace
										? resolve('/(auth)/[cluster]/[workspace]/modules', {
												cluster: activeCluster,
												workspace: page.params.workspace
											})
										: ''
								},
								...(page.params.workspace
									? getAdditionalItems(activeCluster, page.params.workspace!)
									: [])
							]
						}
					]
				: [])
		],
		kubernetes: [
			{
				title: m.workloads(),
				icon: BoxIcon,
				isActive: true,
				items: [
					{
						title: m.deployment(),
						url: resourceUrl({
							group: 'apps',
							version: 'v1',
							kind: 'Deployment',
							resource: 'deployments'
						})
					},
					{
						title: m.stateful_set(),
						url: resourceUrl({
							group: 'apps',
							version: 'v1',
							kind: 'StatefulSet',
							resource: 'statefulsets'
						})
					},
					{
						title: m.daemon_set(),
						url: resourceUrl({
							group: 'apps',
							version: 'v1',
							kind: 'DaemonSet',
							resource: 'daemonsets'
						})
					},
					{
						title: m.cronjob(),
						url: resourceUrl({
							group: 'batch',
							version: 'v1',
							kind: 'CronJob',
							resource: 'cronjobs'
						})
					},
					{
						title: m.job(),
						url: resourceUrl({
							group: 'batch',
							version: 'v1',
							kind: 'Job',
							resource: 'jobs'
						})
					},
					{
						title: m.pod(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'Pod',
							resource: 'pods'
						})
					}
				]
			},
			{
				title: m.configuration(),
				icon: FileTextIcon,
				items: [
					{
						title: m.config_map(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'ConfigMap',
							resource: 'configmaps'
						})
					},
					{
						title: m.secret(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'Secret',
							resource: 'secrets'
						})
					}
				]
			},
			{
				title: m.networking(),
				icon: NetworkIcon,
				items: [
					{
						title: m.service(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'Service',
							resource: 'services'
						})
					},
					{
						title: m.http_route(),
						url: resourceUrl({
							group: 'gateway.networking.k8s.io',
							version: 'v1',
							kind: 'HTTPRoute',
							resource: 'httproutes'
						})
					},
					{
						title: m.gateway(),
						url: resourceUrl({
							group: 'gateway.networking.k8s.io',
							version: 'v1',
							kind: 'Gateway',
							resource: 'gateways'
						})
					},
					{
						title: m.network_policy(),
						url: resourceUrl({
							group: 'networking.k8s.io',
							version: 'v1',
							kind: 'NetworkPolicy',
							resource: 'networkpolicies'
						})
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.persistent_volume_claim(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'PersistentVolumeClaim',
							resource: 'persistentvolumeclaims'
						})
					},
					{
						title: m.storage_class(),
						url: resourceUrl({
							group: 'storage.k8s.io',
							version: 'v1',
							kind: 'StorageClass',
							resource: 'storageclasses'
						})
					}
				]
			},
			{
				title: m.namespaced(),
				icon: BracesIcon,
				items: [
					{
						title: m.service_account(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'ServiceAccount',
							resource: 'serviceaccounts'
						})
					},
					{
						title: m.role(),
						url: resourceUrl({
							group: 'rbac.authorization.k8s.io',
							version: 'v1',
							kind: 'Role',
							resource: 'roles'
						})
					},
					{
						title: m.role_binding(),
						url: resourceUrl({
							group: 'rbac.authorization.k8s.io',
							version: 'v1',
							kind: 'RoleBinding',
							resource: 'rolebindings'
						})
					},
					{
						title: m.resource_quota(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'ResourceQuota',
							resource: 'resourcequotas'
						})
					},
					{
						title: m.limit_range(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'LimitRange',
							resource: 'limitranges'
						})
					},
					{
						title: m.event(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'Event',
							resource: 'events'
						})
					}
				]
			},
			{
				title: m.cluster(),
				icon: LayersIcon,
				items: [
					{
						title: m.node(),
						url: resourceUrl({
							group: '',
							version: 'v1',
							kind: 'Node',
							resource: 'nodes'
						})
					}
				]
			},
			...(data.isClusterAdmin
				? [
						{
							title: m.administration(),
							icon: UserStarIcon,
							items: [
								{
									title: m.namespace(),
									url: resourceUrl({
										group: '',
										version: 'v1',
										kind: 'Namespace',
										resource: 'namespaces'
									})
								},
								{
									title: m.custom_resource_definition(),
									url: resourceUrl({
										group: 'apiextensions.k8s.io',
										version: 'v1',
										kind: 'CustomResourceDefinition',
										resource: 'customresourcedefinitions'
									})
								},
								{
									title: m.cluster_role(),
									url: resourceUrl({
										group: 'rbac.authorization.k8s.io',
										version: 'v1',
										kind: 'ClusterRole',
										resource: 'clusterroles'
									})
								},
								{
									title: m.cluster_role_binding(),
									url: resourceUrl({
										group: 'rbac.authorization.k8s.io',
										version: 'v1',
										kind: 'ClusterRoleBinding',
										resource: 'clusterrolebindings'
									})
								}
							]
						}
					]
				: [])
		]
	});
</script>

<svelte:head>
	<title>{current ? `${current.title} - OtterScale` : 'OtterScale'}</title>
</svelte:head>

<DialogAbout bind:open={aboutOpen} />
<Sidebar.Provider class="h-svh overflow-hidden" bind:open={sidebarOpen}>
	<Sidebar.Root id="sidebar-guide-step" collapsible="icon" variant="inset" class="p-3">
		{#if activeCluster && isMounted}
			<Sidebar.Header id="workspace-guide-step">
				<WorkspaceSwitcher
					cluster={activeCluster}
					{workspaces}
					user={data.user}
					workspace={page.params.workspace}
				/>
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
				{#if page.params.workspace}
					<NavMain
						platformLabel={m.platform()}
						platformItems={navData.platform}
						kubernetesLabel={m.kubernetes()}
						kubernetesItems={navData.kubernetes}
					/>
				{:else}
					{@render contentSkeleton(sidebarOpen)}
				{/if}
			</Sidebar.Content>
		{:else}
			<Sidebar.Header id="workspace-guide-step">
				{@render headerSkeleton(sidebarOpen)}
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
				{@render contentSkeleton(sidebarOpen)}
			</Sidebar.Content>
		{/if}
		<NavSecondary harborUrl={env.PUBLIC_HARBOR_URL} />
		<Sidebar.Footer>
			<NavUser user={data.user} />
		</Sidebar.Footer>
		<Sidebar.Rail />
	</Sidebar.Root>
	<Sidebar.Inset class="min-w-0 overflow-hidden">
		<header
			class="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						{#each $breadcrumbs as item (item.url)}
							{#if item.url === current?.url}
								<Breadcrumb.Item>
									<Breadcrumb.Page>{current.title}</Breadcrumb.Page>
								</Breadcrumb.Item>
							{:else}
								<Breadcrumb.Item class="hidden md:block">
									<Breadcrumb.Link href={item.url}>{item.title}</Breadcrumb.Link>
								</Breadcrumb.Item>
								<Breadcrumb.Separator class="hidden md:block" />
							{/if}
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
			<div class="flex items-center gap-2 px-4">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-7"
								onclick={() => (aboutOpen = true)}
							>
								<InfoIcon />
								<span class="sr-only">About</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>About OtterScale</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon" class="size-7" onclick={startTour}>
								<CircleQuestionMarkIcon />
								<span class="sr-only">Guide Tour</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Start Guide Tour</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<DropdownMenu.Root>
						<Tooltip.Trigger>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										id="cluster-guide-step"
										variant="ghost"
										size="icon"
										class="size-7"
									>
										<LayersIcon />
										<span class="sr-only">Toggle Clusters</span>
									</Button>
									{#if !activeCluster}
										<span class="absolute top-3.5 right-3.5 flex size-2.5 transition-all">
											<span
												class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"
											></span>
											<span class="relative inline-flex size-2.5 rounded-full bg-blue-500"></span>
										</span>
									{/if}
								{/snippet}
							</DropdownMenu.Trigger>
						</Tooltip.Trigger>
						<DropdownMenu.Content class="w-40" align="end">
							<DropdownMenu.Group>
								<DropdownMenu.Label>{m.cluster()}</DropdownMenu.Label>
								{#if links.length > 0}
									<DropdownMenu.Separator />
									<DropdownMenu.RadioGroup
										bind:value={activeCluster}
										onValueChange={onClusterChange}
									>
										{#each links as link, index (index)}
											<DropdownMenu.RadioItem value={link.cluster}
												>{link.cluster}</DropdownMenu.RadioItem
											>
										{/each}
									</DropdownMenu.RadioGroup>
								{/if}
								{#if data.user.roles.includes('admin')}
									<RegisteClusterTrigger bind:open={importOpen} />
								{/if}
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Tooltip.Content>Switch Cluster</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</header>
		<main class="flex min-w-0 flex-1 flex-col overflow-auto px-2 md:px-4 lg:px-8">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

{#snippet headerSkeleton(sidebarOpen?: boolean)}
	{#if sidebarOpen}
		<div class="flex w-full items-center gap-2 overflow-hidden rounded-md p-2">
			<Skeleton class="size-8 bg-foreground/10" />
			<div class="space-y-2">
				<Skeleton class="h-3 w-36 bg-foreground/10" />
				<Skeleton class="h-2 w-12 bg-foreground/10" />
			</div>
		</div>
	{:else}
		<Skeleton class="size-8 bg-foreground/10" />
	{/if}
{/snippet}

{#snippet contentSkeleton(sidebarOpen?: boolean)}
	{#each Array.from({ length: 3 }, (_, i) => i) as index (index)}
		{#if sidebarOpen}
			<div class="relative flex w-full min-w-0 flex-col space-y-4 px-4 py-2">
				<Skeleton class="h-3 w-8 bg-foreground/10" />
				<div class="flex items-center space-x-2">
					<Skeleton class="h-4 w-4 bg-foreground/10" />
					<Skeleton class="h-4 w-32 bg-foreground/10" />
				</div>
				<div class="flex items-center space-x-2">
					<Skeleton class="h-4 w-4 bg-foreground/10" />
					<Skeleton class="h-4 w-32 bg-foreground/10" />
				</div>
				<div class="flex items-center space-x-2">
					<Skeleton class="h-4 w-4 bg-foreground/10" />
					<Skeleton class="h-4 w-32 bg-foreground/10" />
				</div>
			</div>
		{:else}
			<div class="flex h-8 items-center justify-center gap-2 rounded-md pt-4 pl-1">
				<Skeleton class="size-4 bg-foreground/10" />
			</div>
		{/if}
	{/each}
{/snippet}

<Registe
	bind:open={importOpen}
	onsuccess={async () => {
		links = await fetchClusters();
	}}
/>
