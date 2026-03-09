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
		UserStarIcon
	} from '@lucide/svelte';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onMount, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import { type Scope, ScopeService } from '$lib/api/scope/v1/scope_pb';
	import {
		DialogAbout,
		DialogAbout,
		NavMain,
		NavSecondary,
		NavUser,
		startTour,
		WorkspaceSwitcher
	} from '$lib/components/layout';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/paraglide/messages';
	import { activeNamespace, breadcrumbs } from '$lib/stores';

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
	const scopeClient = createClient(ScopeService, transport);
	const resourceClient = createClient(ResourceService, transport);

	let activeScope = $state(page.params.scope ?? page.params.cluster ?? '');
	let scopes = $state<Scope[]>([]);
	let workspaces = $state<TenantOtterscaleIoV1Alpha1Workspace[]>([]);
	let aboutOpen = $state(false);

	async function fetchScopes() {
		try {
			const response = await scopeClient.listScopes({});
			scopes = response.scopes.filter((scope) => scope.name !== 'cos');
		} catch (error) {
			console.error('Failed to fetch scopes:', error);
		}
	}

	async function fetchWorkspaces(cluster: string) {
		try {
			const response = await resourceClient.list({
				cluster: cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces'
				// labelSelector: 'user.otterscale.io/' + data.user.sub
			});
			workspaces = response.items.map((item) => item.object as TenantOtterscaleIoV1Alpha1Workspace);
		} catch (error) {
			console.error('Failed to fetch workspaces:', error);
		}
	}

	async function onValueChange(cluster: string) {
		await fetchWorkspaces(cluster);
		await goto(resolve('/(auth)/scope/[scope]/workspace', { scope: cluster }));
		toast.success(m.switch_scope({ name: cluster }));
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchScopes();

		if (activeScope) {
			await fetchWorkspaces(activeScope);
		}

		isMounted = true;
	});

	function onAboutClick() {
		aboutOpen = true;
	}

	function resourceUrl(kind: string, group: string, version: string, resource: string) {
		return resolve(
			`/(auth)/${activeScope}/${kind}?group=${group}&version=${version}&namespace=${$activeNamespace}&resource=${resource}`
		);
	}

	const navData = $derived({
		managed: [
			{
				title: m.overview(),
				url: resolve('/(auth)/scope/[scope]/workspace', { scope: activeScope }),
				icon: CompassIcon
			},
			{
				title: m.ai_studio(),
				icon: BotIcon,
				isActive: true,
				items: [
					{
						title: m.dashboard(),
						url: resolve('/(auth)/scope/[scope]/models', { scope: activeScope })
					},
					{
						title: m.model(),
						url: resourceUrl('ModelService', 'model.otterscale.io', 'v1alpha1', 'modelservices')
					},
					{
						title: m.artifact(),
						url: resourceUrl('ModelArtifact', 'model.otterscale.io', 'v1alpha1', 'modelartifacts')
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
						url: resourceUrl('Application', 'workload.otterscale.io', 'v1alpha1', 'applications')
					},
					{
						title: m.release(),
						url: resourceUrl('HelmRelease', 'helm.toolkit.fluxcd.io', 'v2', 'helmreleases')
					},
					{
						title: m.hub(),
						url: resolve('/(auth)/registry')
					}
				]
			},
			{
				title: m.compute(),
				icon: CpuIcon,
				items: [
					{
						title: m.dashboard(),
						url: resolve('/(auth)/scope/[scope]/compute', { scope: activeScope })
					},
					{
						title: m.virtual_machine(),
						url: resourceUrl('VirtualMachine', 'kubevirt.io', 'v1', 'virtualmachines')
					},
					{
						title: m.data_volume(),
						url: resourceUrl('DataVolume', 'cdi.kubevirt.io', 'v1beta1', 'datavolumes')
					},
					{
						title: m.instance_type(),
						url: resourceUrl(
							'VirtualMachineInstancetype',
							'instancetype.kubevirt.io',
							'v1beta1',
							'virtualmachineinstancetypes'
						)
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.dashboard(),
						url: resolve('/(auth)/scope/[scope]/storage', { scope: activeScope })
					},
					{
						title: m.block_pool(),
						url: resourceUrl('CephBlockPool', 'ceph.rook.io', 'v1', 'cephblockpools')
					},
					{
						title: m.file_system(),
						url: resourceUrl('CephFilesystem', 'ceph.rook.io', 'v1', 'cephfilesystems')
					},
					{
						title: m.object_store(),
						url: resourceUrl('CephObjectStore', 'ceph.rook.io', 'v1', 'cephobjectstores')
					}
				]
			},
			{
				title: m.administration(),
				icon: UserStarIcon,
				isActive: true,
				items: [
					{
						title: m.workspace(),
						url: resourceUrl('Workspace', 'tenant.otterscale.io', 'v1alpha1', 'workspaces')
					},
					{
						title: m.module(),
						url: resourceUrl('Module', 'module.otterscale.io', 'v1alpha1', 'modules')
					}
				]
			}
		],
		native: [
			{
				title: m.overview(),
				url: resolve('/(auth)/scope/[scope]/kubernetes', { scope: activeScope }),
				icon: CompassIcon
			},
			{
				title: m.workloads(),
				icon: BoxIcon,
				isActive: true,
				items: [
					{
						title: m.deployment(),
						url: resourceUrl('Deployment', 'apps', 'v1', 'deployments')
					},
					{
						title: m.stateful_set(),
						url: resourceUrl('StatefulSet', 'apps', 'v1', 'statefulsets')
					},
					{
						title: m.daemon_set(),
						url: resourceUrl('DaemonSet', 'apps', 'v1', 'daemonsets')
					},
					{
						title: m.cronjob(),
						url: resourceUrl('CronJob', 'batch', 'v1', 'cronjobs')
					},
					{
						title: m.job(),
						url: resourceUrl('Job', 'batch', 'v1', 'jobs')
					},
					{
						title: m.pod(),
						url: resourceUrl('Pod', '', 'v1', 'pods')
					}
				]
			},
			{
				title: m.configuration(),
				icon: FileTextIcon,
				items: [
					{
						title: m.config_map(),
						url: resourceUrl('ConfigMap', '', 'v1', 'configmaps')
					},
					{
						title: m.secret(),
						url: resourceUrl('Secret', '', 'v1', 'secrets')
					}
				]
			},
			{
				title: m.networking(),
				icon: NetworkIcon,
				items: [
					{
						title: m.service(),
						url: resourceUrl('Service', '', 'v1', 'services')
					},
					{
						title: m.http_route(),
						url: resourceUrl('HTTPRoute', 'gateway.networking.k8s.io', 'v1', 'httproutes')
					},
					{
						title: m.gateway(),
						url: resourceUrl('Gateway', 'gateway.networking.k8s.io', 'v1', 'gateways')
					},
					{
						title: m.network_policy(),
						url: resourceUrl('NetworkPolicy', 'networking.k8s.io', 'v1', 'networkpolicies')
					}
				]
			},
			{
				title: m.storage(),
				icon: HardDriveIcon,
				items: [
					{
						title: m.persistent_volume_claim(),
						url: resourceUrl('PersistentVolumeClaim', '', 'v1', 'persistentvolumeclaims')
					},
					{
						title: m.persistent_volume(),
						url: resourceUrl('PersistentVolume', '', 'v1', 'persistentvolumes')
					},
					{
						title: m.storage_class(),
						url: resourceUrl('StorageClass', 'storage.k8s.io', 'v1', 'storageclasses')
					}
				]
			},
			{
				title: m.namespaced(),
				icon: BracesIcon,
				items: [
					{
						title: m.namespace(),
						url: resourceUrl('Namespace', '', 'v1', 'namespaces')
					},
					{
						title: m.service_account(),
						url: resourceUrl('ServiceAccount', '', 'v1', 'serviceaccounts')
					},
					{
						title: m.role(),
						url: resourceUrl('Role', 'rbac.authorization.k8s.io', 'v1', 'roles')
					},
					{
						title: m.role_binding(),
						url: resourceUrl('RoleBinding', 'rbac.authorization.k8s.io', 'v1', 'rolebindings')
					},
					{
						title: m.resource_quota(),
						url: resourceUrl('ResourceQuota', '', 'v1', 'resourcequotas')
					},
					{
						title: m.limit_range(),
						url: resourceUrl('LimitRange', '', 'v1', 'limitranges')
					}
				]
			},
			{
				title: m.cluster(),
				icon: LayersIcon,
				items: [
					{
						title: m.node(),
						url: resourceUrl('Node', '', 'v1', 'nodes')
					},
					{
						title: m.event(),
						url: resourceUrl('Event', '', 'v1', 'events')
					},
					{
						title: m.custom_resource_definition(),
						url: resourceUrl(
							'CustomResourceDefinition',
							'apiextensions.k8s.io',
							'v1',
							'customresourcedefinitions'
						)
					},
					{
						title: m.cluster_role(),
						url: resourceUrl('ClusterRole', 'rbac.authorization.k8s.io', 'v1', 'clusterroles')
					},
					{
						title: m.cluster_role_binding(),
						url: resourceUrl(
							'ClusterRoleBinding',
							'rbac.authorization.k8s.io',
							'v1',
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

<Sidebar.Provider>
	<Sidebar.Root id="sidebar-guide-step" collapsible="icon" variant="inset" class="p-3">
		{#if activeScope && isMounted}
			<Sidebar.Header id="workspace-guide-step">
				<WorkspaceSwitcher
					cluster={activeScope}
					{workspaces}
					user={data.user}
					onsuccess={() => fetchWorkspaces(activeScope)}
				/>
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
				{#if $activeNamespace}
					<NavMain
						managedLabel={m.managed()}
						managedItems={navData.managed}
						nativeLabel={m.native()}
						nativeItems={navData.native}
					/>
				{:else}
					{@render contentSkeleton()}
				{/if}
			</Sidebar.Content>
		{:else}
			<Sidebar.Header id="workspace-guide-step">
				{@render headerSkeleton()}
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
				{@render contentSkeleton()}
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
				<Button variant="ghost" size="icon" class="size-7" onclick={onAboutClick}>
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
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-40" align="end">
						<DropdownMenu.Group>
							<DropdownMenu.Label>{m.cluster()}</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.RadioGroup bind:value={activeScope} {onValueChange}>
								{#each scopes as scope, index (index)}
									<DropdownMenu.RadioItem value={scope.name}>{scope.name}</DropdownMenu.RadioItem>
								{/each}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</header>
		<main class="flex flex-1 flex-col px-2 md:px-4 lg:px-8">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

{#snippet headerSkeleton()}
	<div class="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2">
		<Skeleton class="size-8 bg-foreground/10" />
		<div class="space-y-2">
			<Skeleton class="h-3 w-36 bg-foreground/10" />
			<Skeleton class="h-2 w-12 bg-foreground/10" />
		</div>
	</div>
{/snippet}

{#snippet contentSkeleton()}
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
{/snippet}
