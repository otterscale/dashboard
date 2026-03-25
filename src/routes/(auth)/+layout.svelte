<script lang="ts">
	import 'driver.js/dist/driver.css';

	import { createClient, type Transport } from '@connectrpc/connect';
	import {
		BotIcon,
		BoxIcon,
		BracesIcon,
		CircleQuestionMarkIcon,
		CompassIcon,
		CpuIcon,
		FileTextIcon,
		HardDriveIcon,
		InfoIcon,
		LayersIcon,
		LayoutGridIcon,
		NetworkIcon,
		PlusIcon,
		UserStarIcon
	} from '@lucide/svelte';
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
	import DialogImportCluster from '$lib/components/layout/dialog-import-cluster.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

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

	async function fetchClusters() {
		try {
			const response = await linkClient.listLinks({});
			links = response.links;
		} catch (error) {
			console.error('Failed to fetch links:', error);
		}
	}

	async function fetchWorkspaces(cluster: string) {
		try {
			const response = await resourceClient.list({
				cluster: cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				labelSelector: 'user.otterscale.io/' + data.user.sub
			});
			workspaces = response.items.map((item) => item.object as TenantOtterscaleIoV1Alpha1Workspace);
		} catch (error) {
			console.error('Failed to fetch workspaces:', error);
		}
	}

	async function onClusterChange(cluster: string) {
		await fetchWorkspaces(cluster);
		await goto(resolve('/(auth)/[cluster]/overview', { cluster: activeCluster }));
		toast.success(m.switch_cluster({ name: cluster }));
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchClusters();
		if (activeCluster) {
			await fetchWorkspaces(activeCluster);
		}
		isMounted = true;
	});

	function resourceUrl(group: string, version: string, kind: string, resource: string) {
		const workspace = page.params.workspace ?? '_';
		return resolve(
			`/(auth)/${activeCluster}/${workspace}?group=${group}&version=${version}&kind=${kind}&resource=${resource}`
		);
	}

	const navData = $derived({
		managed: [
			{
				title: m.overview(),
				url: page.params.workspace
					? resolve('/(auth)/[cluster]/[workspace]/overview', {
							cluster: activeCluster,
							workspace: page.params.workspace
						})
					: '',
				icon: CompassIcon
			},
			{
				title: m.ai_studio(),
				icon: BotIcon,
				isActive: true,
				items: [
					{
						title: m.dashboard(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/model/dashboard', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.model(),
						url: resourceUrl('model.otterscale.io', 'v1alpha1', 'ModelService', 'modelservices')
					},
					{
						title: m.artifact(),
						url: resourceUrl('model.otterscale.io', 'v1alpha1', 'ModelArtifact', 'modelartifacts')
					}
				]
			},
			{
				title: m.apps(),
				icon: LayoutGridIcon,
				isActive: true,
				items: [
					{
						title: m.application(),
						url: resourceUrl('workload.otterscale.io', 'v1alpha1', 'Application', 'applications')
					},
					{
						title: m.release(),
						url: resourceUrl('helm.toolkit.fluxcd.io', 'v2', 'HelmRelease', 'helmreleases')
					},
					{
						title: m.repository(),
						url: resourceUrl('source.toolkit.fluxcd.io', 'v1', 'HelmRepository', 'helmrepositories')
					},
					{
						title: m.application_hub(),
						url: resolve('/(auth)/[cluster]/[workspace]/hub', {
							cluster: activeCluster,
							workspace: page.params.workspace!
						})
					}
				]
			},
			{
				title: m.compute(),
				icon: CpuIcon,
				items: [
					{
						title: m.dashboard(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/compute/dashboard', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.virtual_machine(),
						url: resourceUrl('kubevirt.io', 'v1', 'VirtualMachine', 'virtualmachines')
					},

					{
						title: m.instance_type(),
						url: resourceUrl(
							'instancetype.kubevirt.io',
							'v1beta1',
							'VirtualMachineInstancetype',
							'virtualmachineinstancetypes'
						)
					},
					{
						title: m.data_volume(),
						url: resourceUrl('cdi.kubevirt.io', 'v1beta1', 'DataVolume', 'datavolumes')
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.dashboard(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/storage/dashboard', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					{
						title: m.block_pool(),
						url: resourceUrl('ceph.rook.io', 'v1', 'CephBlockPool', 'cephblockpools')
					},
					{
						title: m.file_system(),
						url: resourceUrl('ceph.rook.io', 'v1', 'CephFilesystem', 'cephfilesystems')
					},
					{
						title: m.object_store(),
						url: resourceUrl('ceph.rook.io', 'v1', 'CephObjectStore', 'cephobjectstores')
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
									url: resourceUrl('tenant.otterscale.io', 'v1alpha1', 'Workspace', 'workspaces')
								},
								{
									title: m.module(),
									url: resourceUrl('module.otterscale.io', 'v1alpha1', 'Module', 'modules')
								}
							]
						}
					]
				: [])
		],
		native: [
			{
				title: m.overview(),
				url: resolve('/(auth)/[cluster]/overview', { cluster: activeCluster }),
				icon: CompassIcon
			},
			{
				title: m.workloads(),
				icon: BoxIcon,
				isActive: true,
				items: [
					{
						title: m.deployment(),
						url: resourceUrl('apps', 'v1', 'Deployment', 'deployments')
					},
					{
						title: m.stateful_set(),
						url: resourceUrl('apps', 'v1', 'StatefulSet', 'statefulsets')
					},
					{
						title: m.daemon_set(),
						url: resourceUrl('apps', 'v1', 'DaemonSet', 'daemonsets')
					},
					{
						title: m.cronjob(),
						url: resourceUrl('batch', 'v1', 'CronJob', 'cronjobs')
					},
					{
						title: m.job(),
						url: resourceUrl('batch', 'v1', 'Job', 'jobs')
					},
					{
						title: m.pod(),
						url: resourceUrl('', 'v1', 'Pod', 'pods')
					}
				]
			},
			{
				title: m.configuration(),
				icon: FileTextIcon,
				items: [
					{
						title: m.config_map(),
						url: resourceUrl('', 'v1', 'ConfigMap', 'configmaps')
					},
					{
						title: m.secret(),
						url: resourceUrl('', 'v1', 'Secret', 'secrets')
					}
				]
			},
			{
				title: m.networking(),
				icon: NetworkIcon,
				items: [
					{
						title: m.service(),
						url: resourceUrl('', 'v1', 'Service', 'services')
					},
					{
						title: m.http_route(),
						url: resourceUrl('gateway.networking.k8s.io', 'v1', 'HTTPRoute', 'httproutes')
					},
					{
						title: m.gateway(),
						url: resourceUrl('gateway.networking.k8s.io', 'v1', 'Gateway', 'gateways')
					},
					{
						title: m.network_policy(),
						url: resourceUrl('networking.k8s.io', 'v1', 'NetworkPolicy', 'networkpolicies')
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.persistent_volume_claim(),
						url: resourceUrl('', 'v1', 'PersistentVolumeClaim', 'persistentvolumeclaims')
					},
					{
						title: m.persistent_volume(),
						url: resourceUrl('', 'v1', 'PersistentVolume', 'persistentvolumes')
					},
					{
						title: m.storage_class(),
						url: resourceUrl('storage.k8s.io', 'v1', 'StorageClass', 'storageclasses')
					}
				]
			},
			{
				title: m.namespaced(),
				icon: BracesIcon,
				items: [
					{
						title: m.namespace(),
						url: resourceUrl('', 'v1', 'Namespace', 'namespaces')
					},
					{
						title: m.service_account(),
						url: resourceUrl('', 'v1', 'ServiceAccount', 'serviceaccounts')
					},
					{
						title: m.role(),
						url: resourceUrl('rbac.authorization.k8s.io', 'v1', 'Role', 'roles')
					},
					{
						title: m.role_binding(),
						url: resourceUrl('rbac.authorization.k8s.io', 'v1', 'RoleBinding', 'rolebindings')
					},
					{
						title: m.resource_quota(),
						url: resourceUrl('', 'v1', 'ResourceQuota', 'resourcequotas')
					},
					{
						title: m.limit_range(),
						url: resourceUrl('', 'v1', 'LimitRange', 'limitranges')
					},
					{
						title: m.event(),
						url: resourceUrl('', 'v1', 'Event', 'events')
					}
				]
			},
			{
				title: m.cluster(),
				icon: LayersIcon,
				items: [
					{
						title: m.node(),
						url: resourceUrl('', 'v1', 'Node', 'nodes')
					},
					{
						title: m.custom_resource_definition(),
						url: resourceUrl(
							'apiextensions.k8s.io',
							'v1',
							'CustomResourceDefinition',
							'customresourcedefinitions'
						)
					},
					{
						title: m.cluster_role(),
						url: resourceUrl('rbac.authorization.k8s.io', 'v1', 'ClusterRole', 'clusterroles')
					},
					{
						title: m.cluster_role_binding(),
						url: resourceUrl(
							'rbac.authorization.k8s.io',
							'v1',
							'ClusterRoleBinding',
							'clusterrolebindings'
						)
					}
				]
			}
		]
	});
</script>

<svelte:head>
	<title>{current ? `${current.title} - OtterScale` : 'OtterScale'}</title>
</svelte:head>

<DialogAbout bind:open={aboutOpen} />

<Sidebar.Provider bind:open={sidebarOpen}>
	<Sidebar.Root id="sidebar-guide-step" collapsible="icon" variant="inset" class="p-3">
		{#if activeCluster && isMounted}
			<Sidebar.Header id="workspace-guide-step">
				<WorkspaceSwitcher
					cluster={activeCluster}
					{workspaces}
					user={data.user}
					workspace={page.params.workspace}
					onsuccess={() => fetchWorkspaces(activeCluster)}
				/>
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
				{#if page.params.workspace}
					<NavMain
						managedLabel={m.managed()}
						managedItems={navData.managed}
						nativeLabel={m.native()}
						nativeItems={navData.native}
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
	<Sidebar.Inset>
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
				<Button variant="ghost" size="icon" class="size-7" onclick={() => (aboutOpen = true)}>
					<InfoIcon />
					<span class="sr-only">About</span>
				</Button>
				<Button variant="ghost" size="icon" class="size-7" onclick={startTour}>
					<CircleQuestionMarkIcon />
					<span class="sr-only">Guide Tour</span>
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} id="cluster-guide-step" variant="ghost" size="icon" class="size-7">
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
					<DropdownMenu.Content class="w-40" align="end">
						<DropdownMenu.Group>
							<DropdownMenu.Label>{m.cluster()}</DropdownMenu.Label>
							{#if links.length > 0}
								<DropdownMenu.Separator />
								<DropdownMenu.RadioGroup bind:value={activeCluster} onValueChange={onClusterChange}>
									{#each links as link, index (index)}
										<DropdownMenu.RadioItem value={link.cluster}
											>{link.cluster}</DropdownMenu.RadioItem
										>
									{/each}
								</DropdownMenu.RadioGroup>
							{/if}
							{#if data.user.roles.includes('admin')}
								<DropdownMenu.Separator />
								<DropdownMenu.Item onclick={() => (importOpen = true)}>
									<PlusIcon class="mr-2 size-4" />
									{m.add_cluster()}
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				<DialogImportCluster bind:open={importOpen} onsuccess={fetchClusters} />
			</div>
		</header>
		<main class="flex flex-1 flex-col px-2 md:px-4 lg:px-8">
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
