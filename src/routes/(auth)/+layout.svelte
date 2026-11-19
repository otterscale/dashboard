<script lang="ts">
	import 'driver.js/dist/driver.css';

	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BoxesIcon from '@lucide/svelte/icons/boxes';
	import BracesIcon from '@lucide/svelte/icons/braces';
	import CircleQuestionMarkIcon from '@lucide/svelte/icons/circle-question-mark';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
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
		NavMain,
		NavSecondary,
		NavUser,
		NotificationTrigger,
		startTour,
		WorkspaceSwitcher
	} from '$lib/components/layout';
	import ImportCluster from '$lib/components/layout/import-cluster-external.svelte';
	import RegisteClusterTrigger from '$lib/components/layout/registe-cluster-trigger.svelte';
	import { Alert, AlertDescription } from '$lib/components/shadcnio/alert';
	import {
		Breadcrumb,
		BreadcrumbItem,
		BreadcrumbLink,
		BreadcrumbList,
		BreadcrumbPage,
		BreadcrumbSeparator
	} from '$lib/components/shadcnio/breadcrumb';
	import { Button } from '$lib/components/shadcnio/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem,
		DropdownMenuTrigger
	} from '$lib/components/shadcnio/dropdown-menu';
	import { Separator } from '$lib/components/shadcnio/separator';
	import {
		Sidebar,
		SidebarContent,
		SidebarFooter,
		SidebarHeader,
		SidebarInset,
		SidebarProvider,
		SidebarRail,
		SidebarTrigger
	} from '$lib/components/shadcnio/sidebar';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	// The app shell runs on the shadcn.io sidebar. Three pages outside it (the two
	// console pages and the construction placeholder) still read the open state from
	// the sidebar context of components/ui, so that context is provided too, fed from here.
	import { setSidebar as setLegacySidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';
	import { pulse } from '$lib/stores/pulse.svelte';
	import {
		type ClusterFeatures,
		getAdditionalItems,
		getAdditionalNavGroups,
		probeClusterFeatures
	} from '$lib/utils/features';
	import {
		ClusterReleaseLabelSelector,
		WorkspaceReleaseLabelSelector
	} from '$lib/utils/helm-release';
	import { hasRookCephCRD } from '$lib/utils/rook-ceph';

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
	setLegacySidebar({ open: () => sidebarOpen, setOpen: (open) => (sidebarOpen = open) });
	let importOpen = $state(false);
	let hasRookCeph = $state(false);
	let clusterFeatures = $state<ClusterFeatures>({});

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

	$effect(() => {
		if (!activeCluster) {
			hasRookCeph = false;
			return;
		}

		const abortController = new AbortController();
		hasRookCephCRD(transport, activeCluster, abortController.signal)
			.then((exists) => {
				if (!abortController.signal.aborted) hasRookCeph = exists;
			})
			.catch((err) => {
				if (!abortController.signal.aborted) console.error(err);
			});

		return () => abortController.abort();
	});

	$effect(() => {
		if (!activeCluster) {
			clusterFeatures = {};
			return;
		}

		const abortController = new AbortController();
		probeClusterFeatures(transport, activeCluster, abortController.signal)
			.then((features) => {
				if (!abortController.signal.aborted) clusterFeatures = features;
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
					...(data.canViewClusterMetrics
						? [
								{
									title: m.cluster(),
									url: page.params.workspace
										? resolve('/(auth)/[cluster]/[workspace]/dashboard/cluster', {
												cluster: activeCluster,
												workspace: page.params.workspace
											})
										: ''
								}
							]
						: []),
					{
						title: m.model(),
						url: page.params.workspace
							? resolve('/(auth)/[cluster]/[workspace]/dashboard/model', {
									cluster: activeCluster,
									workspace: page.params.workspace
								})
							: ''
					},
					...(hasRookCeph && data.canViewClusterMetrics
						? [
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
						: [])
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
					},
					{
						title: m.api_key(),
						url: resourceUrl({
							group: 'maas.phison.com',
							version: 'v1alpha1',
							kind: 'ApiKey',
							resource: 'apikeys'
						})
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
							resource: 'helmreleases',
							labelSelector: WorkspaceReleaseLabelSelector
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
			...(data.isClusterAdmin
				? getAdditionalNavGroups(clusterFeatures, resourceUrl, data.isClusterAdmin)
				: []),
			...(data.isClusterAdmin
				? [
						{
							title: m.platform_apps(),
							icon: BoxesIcon,
							items: [
								{
									title: m.module(),
									url: page.params.workspace
										? resolve('/(auth)/[cluster]/[workspace]/modules', {
												cluster: activeCluster,
												workspace: page.params.workspace
											})
										: ''
								},
								{
									title: m.operator(),
									url: page.params.workspace
										? resolve('/(auth)/[cluster]/[workspace]/operator', {
												cluster: activeCluster,
												workspace: page.params.workspace
											})
										: ''
								},
								{
									title: m.helm_release(),
									url: resourceUrl({
										group: 'helm.toolkit.fluxcd.io',
										version: 'v2',
										kind: 'HelmRelease',
										resource: 'helmreleases',
										labelSelector: ClusterReleaseLabelSelector
									})
								}
							]
						}
					]
				: []),
			...(data.isClusterAdmin
				? [
						{
							title: m.administration(),
							icon: UserStarIcon,
							items: [
								{
									title: m.resource(),
									url: page.params.workspace
										? resolve('/(auth)/[cluster]/[workspace]/api-resources', {
												cluster: activeCluster,
												workspace: page.params.workspace
											})
										: ''
								},
								{
									title: m.workspace(),
									url: resourceUrl({
										group: 'tenant.otterscale.io',
										version: 'v1alpha1',
										kind: 'Workspace',
										resource: 'workspaces'
									})
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
						title: m.listener_set(),
						url: resourceUrl({
							group: 'gateway.networking.k8s.io',
							version: 'v1',
							kind: 'ListenerSet',
							resource: 'listenersets'
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
	<title>{current ? `${current.title} - ${m.site_title()}` : m.site_title()}</title>
</svelte:head>

<SidebarProvider
	class="h-svh min-h-0 overflow-hidden"
	open={sidebarOpen}
	onOpenChange={(open) => (sidebarOpen = open)}
>
	<Sidebar id="sidebar-guide-step" collapsible="icon">
		{#if activeCluster && isMounted}
			<SidebarHeader
				id="workspace-guide-step"
				class="h-14 justify-center border-b border-sidebar-border"
			>
				<WorkspaceSwitcher
					cluster={activeCluster}
					{workspaces}
					user={data.user}
					workspace={page.params.workspace}
				/>
			</SidebarHeader>
			<SidebarContent>
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
			</SidebarContent>
		{:else}
			<SidebarHeader
				id="workspace-guide-step"
				class="h-14 justify-center border-b border-sidebar-border"
			>
				{@render headerSkeleton(sidebarOpen)}
			</SidebarHeader>
			<SidebarContent>
				{@render contentSkeleton(sidebarOpen)}
			</SidebarContent>
		{/if}
		<NavSecondary harborUrl={env.PUBLIC_HARBOR_URL} class="border-t border-sidebar-border" />
		<SidebarFooter class="border-t border-sidebar-border">
			<NavUser user={data.user} />
		</SidebarFooter>
		<SidebarRail />
	</Sidebar>
	<SidebarInset class="min-w-0 overflow-hidden">
		<header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
			<div class="flex min-w-0 items-center gap-2">
				<SidebarTrigger class="-ms-1" aria-label={m.dash_toggle_sidebar()} />
				<Separator orientation="vertical" class="me-2 h-4! self-center!" />
				<Breadcrumb class="min-w-0">
					<BreadcrumbList class="flex-nowrap">
						{#each $breadcrumbs as item (item.url)}
							{#if item.url === current?.url}
								<BreadcrumbItem class="min-w-0">
									<BreadcrumbPage class="truncate">{current.title}</BreadcrumbPage>
								</BreadcrumbItem>
							{:else}
								<BreadcrumbItem class="hidden md:block">
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<BreadcrumbLink href={item.url}>{item.title}</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator class="hidden md:block" />
							{/if}
						{/each}
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<Tooltip>
					<TooltipTrigger>
						{#snippet asChild(props)}
							<Button {...props()} variant="ghost" size="icon-sm" onclick={startTour}>
								<CircleQuestionMarkIcon />
								<span class="sr-only">{m.dash_guide_tour()}</span>
							</Button>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent>{m.dash_guide_tour()}</TooltipContent>
				</Tooltip>
				<NotificationTrigger />
				<DropdownMenu positioning={{ placement: 'bottom-end', gutter: 6 }}>
					<DropdownMenuTrigger>
						{#snippet asChild(props)}
							<Button
								{...props({ class: 'relative overflow-visible' })}
								id="cluster-guide-step"
								variant="ghost"
								size="icon-sm"
								title={m.dash_switch_cluster()}
							>
								<LayersIcon />
								<span class="sr-only">{m.dash_switch_cluster()}</span>
								{#if !activeCluster}
									<span class="absolute -top-0.5 -right-0.5 flex size-2.5">
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75"
										></span>
										<span class="relative inline-flex size-2.5 rounded-full bg-info"></span>
									</span>
								{/if}
							</Button>
						{/snippet}
					</DropdownMenuTrigger>
					<DropdownMenuContent class="w-44">
						<DropdownMenuRadioGroup
							heading={m.cluster()}
							value={activeCluster}
							onValueChange={(details) => {
								activeCluster = details.value;
								onClusterChange(details.value);
							}}
						>
							{#each links as link, index (index)}
								<DropdownMenuRadioItem value={link.cluster}>{link.cluster}</DropdownMenuRadioItem>
							{/each}
						</DropdownMenuRadioGroup>
						{#if data.user.roles.includes('admin')}
							<RegisteClusterTrigger bind:open={importOpen} />
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
		<main class="flex min-w-0 flex-1 flex-col overflow-auto p-4 md:p-6">
			{#if data.clusterMetricsAccess === 'unknown'}
				<Alert variant="warning" class="mb-4">
					<TriangleAlertIcon />
					<AlertDescription>{m.cluster_metrics_access_unknown()}</AlertDescription>
				</Alert>
			{/if}
			{@render children()}
		</main>
	</SidebarInset>
</SidebarProvider>

{#snippet headerSkeleton(sidebarOpen?: boolean)}
	{#if sidebarOpen}
		<div class="flex w-full items-center gap-2 overflow-hidden rounded-md p-2">
			<Skeleton class="size-8 shrink-0" />
			<div class="grid flex-1 gap-2">
				<Skeleton class="h-3 w-32" />
				<Skeleton class="h-2 w-12" />
			</div>
		</div>
	{:else}
		<Skeleton class="size-8" />
	{/if}
{/snippet}

{#snippet contentSkeleton(sidebarOpen?: boolean)}
	<div class="flex flex-col gap-1 p-2" aria-hidden="true">
		{#if sidebarOpen}
			<Skeleton class="mb-2 h-8 w-full" />
		{/if}
		{#each Array.from({ length: 6 }, (_, i) => i) as index (index)}
			<div class="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:px-0">
				<Skeleton class="size-4 shrink-0" />
				{#if sidebarOpen}
					<Skeleton class="h-3 flex-1" />
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<ImportCluster
	bind:open={importOpen}
	onsuccess={async () => {
		links = await fetchClusters();
	}}
/>
