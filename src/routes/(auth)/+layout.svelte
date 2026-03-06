<script lang="ts">
	import 'driver.js/dist/driver.css';

	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BracesIcon from '@lucide/svelte/icons/braces';
	import CombineIcon from '@lucide/svelte/icons/combine';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import FileKeyIcon from '@lucide/svelte/icons/file-key';
	import FlagIcon from '@lucide/svelte/icons/flag';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
	import HouseIcon from '@lucide/svelte/icons/house';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import LockIcon from '@lucide/svelte/icons/lock';
	import MapIcon from '@lucide/svelte/icons/map';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import PackageIcon from '@lucide/svelte/icons/package';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ServerIcon from '@lucide/svelte/icons/server';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onMount, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import { type Scope, ScopeService } from '$lib/api/scope/v1/scope_pb';
	import {
		NavMain,
		NavOverview,
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
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { m } from '$lib/paraglide/messages';
	import { activeNamespace, breadcrumbs, sidebarView } from '$lib/stores';

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
				resource: 'workspaces',
				labelSelector: 'user.otterscale.io/' + data.user.sub
			});
			workspaces = response.items.map((item) => item.object as TenantOtterscaleIoV1Alpha1Workspace);
		} catch (error) {
			console.error('Failed to fetch workspaces:', error);
		}
	}

	async function onValueChange(cluster: string) {
		await fetchWorkspaces(cluster);
		await goto(resolve('/(auth)/scope/[scope]/managed', { scope: cluster }));
		toast.success(m.switch_scope({ name: cluster }));
	}

	async function onHomeClick() {
		await goto(resolve('/(auth)/scope/[scope]/managed', { scope: activeScope }));
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchScopes();

		if (activeScope) {
			await fetchWorkspaces(activeScope);
		}

		isMounted = true;
	});

	function resourceUrl(kind: string, group: string, version: string, resource: string) {
		return resolve(
			`/(auth)/${activeScope}/${kind}?group=${group}&version=${version}&namespace=${$activeNamespace}&resource=${resource}`
		);
	}

	const managedNavData = $derived({
		overview: [
			{
				name: m.overview(),
				url: resolve('/(auth)/scope/[scope]/managed', { scope: activeScope }),
				icon: GaugeIcon,
				edit: false
			}
		],
		ai: [
			{
				title: m.dashboard(),
				url: resolve('/(auth)/scope/[scope]/models', { scope: activeScope }),
				icon: GaugeIcon
			},
			{
				title: m.model(),
				url: resourceUrl('Model', 'model.otterscale.io', 'v1alpha1', 'models'),
				icon: BotIcon
			},
			{
				title: m.model_artifact(),
				url: resourceUrl('ModelArtifact', 'model.otterscale.io', 'v1alpha1', 'modelartifacts'),
				icon: PackageIcon
			}
		],
		apps: [
			{
				title: m.release(),
				url: resourceUrl('HelmRelease', 'helm.toolkit.fluxcd.io', 'v2', 'helmreleases'),
				icon: FlagIcon
			},
			{
				title: m.hub(),
				url: '#',
				icon: LayoutGridIcon
			}
		],
		compute: [
			{
				title: m.dashboard(),
				url: resolve('/(auth)/scope/[scope]/compute', { scope: activeScope }),
				icon: GaugeIcon
			},
			{
				title: m.virtual_machine(),
				url: resourceUrl('VirtualMachine', 'kubevirt.io', 'v1', 'virtualmachines'),
				icon: MonitorIcon
			},
			{
				title: m.data_volume(),
				url: resourceUrl('DataVolume', 'cdi.kubevirt.io', 'v1beta1', 'datavolumes'),
				icon: HardDriveIcon
			},
			{
				title: m.instance_type(),
				url: resourceUrl(
					'VirtualMachineInstancetype',
					'instancetype.kubevirt.io',
					'v1beta1',
					'virtualmachineinstancetypes'
				),
				icon: CpuIcon
			}
		],
		storage: [
			{
				title: m.dashboard(),
				url: resolve('/(auth)/scope/[scope]/storage', { scope: activeScope }),
				icon: GaugeIcon
			},
			{
				title: m.block_pool(),
				url: resourceUrl('CephBlockPool', 'ceph.rook.io', 'v1', 'cephblockpools'),
				icon: HardDriveIcon
			},
			{
				title: m.file_system(),
				url: resourceUrl('CephFilesystem', 'ceph.rook.io', 'v1', 'cephfilesystems'),
				icon: HardDriveIcon
			},
			{
				title: m.object_store(),
				url: resourceUrl('CephObjectStore', 'ceph.rook.io', 'v1', 'cephobjectstores'),
				icon: HardDriveIcon
			}
		],
		administration: [
			{
				title: m.workspace(),
				url: resourceUrl('Workspace', 'tenant.otterscale.io', 'v1alpha1', 'workspaces'),
				icon: MapIcon
			},
			{
				title: m.module(),
				url: resourceUrl('Module', 'module.otterscale.io', 'v1alpha1', 'modules'),
				icon: PackageIcon
			},
			{
				title: m.resources(),
				url: '#',
				icon: SearchIcon
			}
		]
	});

	const kubernetesNavData = $derived({
		overview: [
			{
				name: m.overview(),
				url: resolve('/(auth)/scope/[scope]/kubernetes', { scope: activeScope }),
				icon: GaugeIcon,
				edit: false
			}
		],
		workloads: [
			{
				title: m.deployment(),
				url: resourceUrl('Deployment', 'apps', 'v1', 'deployments'),
				icon: FlagIcon
			},
			{
				title: m.stateful_set(),
				url: resourceUrl('StatefulSet', 'apps', 'v1', 'statefulsets'),
				icon: FlagIcon
			},
			{
				title: m.daemon_set(),
				url: resourceUrl('DaemonSet', 'apps', 'v1', 'daemonsets'),
				icon: FlagIcon
			},
			{
				title: m.cronjob(),
				url: resourceUrl('CronJob', 'batch', 'v1', 'cronjobs'),
				icon: FlagIcon
			},
			{
				title: m.job(),
				url: resourceUrl('Job', 'batch', 'v1', 'jobs'),
				icon: FlagIcon
			},
			{
				title: m.pod(),
				url: resourceUrl('Pod', '', 'v1', 'pods'),
				icon: BoxIcon
			}
		],
		configuration: [
			{
				title: m.config_map(),
				url: resourceUrl('ConfigMap', '', 'v1', 'configmaps'),
				icon: FileKeyIcon
			},
			{
				title: m.secret(),
				url: resourceUrl('Secret', '', 'v1', 'secrets'),
				icon: LockIcon
			}
		],
		networking: [
			{
				title: m.service(),
				url: resourceUrl('Service', '', 'v1', 'services'),
				icon: GlobeIcon
			},
			{
				title: m.http_route(),
				url: resourceUrl('HTTPRoute', 'gateway.networking.k8s.io', 'v1', 'httproutes'),
				icon: NetworkIcon
			},
			{
				title: m.gateway(),
				url: resourceUrl('Gateway', 'gateway.networking.k8s.io', 'v1', 'gateways'),
				icon: NetworkIcon
			},
			{
				title: m.network_policy(),
				url: resourceUrl('NetworkPolicy', 'networking.k8s.io', 'v1', 'networkpolicies'),
				icon: ShieldIcon
			}
		],
		storage: [
			{
				title: m.persistent_volume_claim(),
				url: resourceUrl('PersistentVolumeClaim', '', 'v1', 'persistentvolumeclaims'),
				icon: HardDriveIcon
			},
			{
				title: m.persistent_volume(),
				url: resourceUrl('PersistentVolume', '', 'v1', 'persistentvolumes'),
				icon: HardDriveIcon
			},
			{
				title: m.storage_class(),
				url: resourceUrl('StorageClass', 'storage.k8s.io', 'v1', 'storageclasses'),
				icon: HardDriveIcon
			}
		],
		namespaced: [
			{
				title: m.namespace(),
				url: resourceUrl('Namespace', '', 'v1', 'namespaces'),
				icon: BracesIcon
			},
			{
				title: m.service_account(),
				url: resourceUrl('ServiceAccount', '', 'v1', 'serviceaccounts'),
				icon: KeyRoundIcon
			},
			{
				title: m.role(),
				url: resourceUrl('Role', 'rbac.authorization.k8s.io', 'v1', 'roles'),
				icon: ShieldIcon
			},
			{
				title: m.role_binding(),
				url: resourceUrl('RoleBinding', 'rbac.authorization.k8s.io', 'v1', 'rolebindings'),
				icon: ShieldIcon
			},
			{
				title: m.resource_quota(),
				url: resourceUrl('ResourceQuota', '', 'v1', 'resourcequotas'),
				icon: BoxIcon
			},
			{
				title: m.limit_range(),
				url: resourceUrl('LimitRange', '', 'v1', 'limitranges'),
				icon: SlidersHorizontalIcon
			}
		],
		cluster: [
			{
				title: m.node(),
				url: resourceUrl('Node', '', 'v1', 'nodes'),
				icon: ServerIcon
			},
			{
				title: m.event(),
				url: resourceUrl('Event', '', 'v1', 'events'),
				icon: FlagIcon
			},
			{
				title: m.custom_resource_definition(),
				url: resourceUrl(
					'CustomResourceDefinition',
					'apiextensions.k8s.io',
					'v1',
					'customresourcedefinitions'
				),
				icon: SettingsIcon
			},
			{
				title: m.cluster_role(),
				url: resourceUrl('ClusterRole', 'rbac.authorization.k8s.io', 'v1', 'clusterroles'),
				icon: ShieldIcon
			},
			{
				title: m.cluster_role_binding(),
				url: resourceUrl(
					'ClusterRoleBinding',
					'rbac.authorization.k8s.io',
					'v1',
					'clusterrolebindings'
				),
				icon: ShieldIcon
			}
		]
	});
</script>

<svelte:head>
	<title>{current ? `${current.title} - OtterScale` : 'OtterScale'}</title>
</svelte:head>

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
				<div class="px-2 pt-2 group-data-[collapsible=icon]:hidden">
					<ToggleGroup.Root
						type="single"
						bind:value={$sidebarView}
						variant="outline"
						class="w-full"
					>
						<ToggleGroup.Item value="managed" class="flex-1 text-xs">
							{m.managed()}
						</ToggleGroup.Item>
						<ToggleGroup.Item value="kubernetes" class="flex-1 text-xs">
							{m.kubernetes()}
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
			</Sidebar.Header>
			{#if $activeNamespace}
				<Sidebar.Content class="gap-2">
					{#if $sidebarView === 'managed'}
						<NavOverview items={managedNavData.overview} />
						<NavMain label={m.ai_studio()} items={managedNavData.ai} />
						<NavMain label={m.apps()} items={managedNavData.apps} />
						<NavMain label={m.compute()} items={managedNavData.compute} />
						<NavMain label={m.storage()} items={managedNavData.storage} />
						<NavMain label={m.administration()} items={managedNavData.administration} />
					{:else}
						<NavOverview items={kubernetesNavData.overview} />
						<NavMain label={m.workloads()} items={kubernetesNavData.workloads} />
						<NavMain label={m.configuration()} items={kubernetesNavData.configuration} />
						<NavMain label={m.networking()} items={kubernetesNavData.networking} />
						<NavMain label={m.storage()} items={kubernetesNavData.storage} />
						<NavMain label={m.namespaced()} items={kubernetesNavData.namespaced} />
						<NavMain label={m.cluster()} items={kubernetesNavData.cluster} />
					{/if}
				</Sidebar.Content>
			{/if}
		{:else}
			<Sidebar.Header id="workspace-guide-step">
				<div class="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2">
					<Skeleton class="size-8 bg-foreground/10" />
					<div class="space-y-2">
						<Skeleton class="h-3 w-36 bg-foreground/10" />
						<Skeleton class="h-2 w-12 bg-foreground/10" />
					</div>
				</div>
			</Sidebar.Header>
			<Sidebar.Content class="gap-2">
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
			</Sidebar.Content>
		{/if}
		<NavSecondary />
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
				<Button variant="ghost" size="icon" class="size-7" onclick={startTour}>
					<HelpCircleIcon />
					<span class="sr-only">Help</span>
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} id="cluster-guide-step" variant="ghost" size="icon" class="size-7">
								<CombineIcon />
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
				<Button variant="ghost" size="icon" class="size-7" onclick={onHomeClick}>
					<HouseIcon />
					<span class="sr-only">Back to Home</span>
				</Button>
			</div>
		</header>
		<main class="flex flex-1 flex-col px-2 md:px-4 lg:px-8">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
