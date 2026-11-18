<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ApertureIcon from '@lucide/svelte/icons/aperture';
	import AudioWaveformIcon from '@lucide/svelte/icons/audio-waveform';
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BriefcaseIcon from '@lucide/svelte/icons/briefcase';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import CommandIcon from '@lucide/svelte/icons/command';
	import ComponentIcon from '@lucide/svelte/icons/component';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import CylinderIcon from '@lucide/svelte/icons/cylinder';
	import DiamondIcon from '@lucide/svelte/icons/diamond';
	import DiscIcon from '@lucide/svelte/icons/disc';
	import DnaIcon from '@lucide/svelte/icons/dna';
	import FrameIcon from '@lucide/svelte/icons/frame';
	import GalleryVerticalEndIcon from '@lucide/svelte/icons/gallery-vertical-end';
	import GemIcon from '@lucide/svelte/icons/gem';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import GridIcon from '@lucide/svelte/icons/grid';
	import HashIcon from '@lucide/svelte/icons/hash';
	import HexagonIcon from '@lucide/svelte/icons/hexagon';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import MedalIcon from '@lucide/svelte/icons/medal';
	import MountainIcon from '@lucide/svelte/icons/mountain';
	import PackageIcon from '@lucide/svelte/icons/package';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PyramidIcon from '@lucide/svelte/icons/pyramid';
	import RadarIcon from '@lucide/svelte/icons/radar';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { type TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import { getContext } from 'svelte';
	import { type Component, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { shortcut } from '$lib/actions/shortcut.svelte';
	import CreateWorkspace from '$lib/components/kind-viewer/kind-viewer-actions/utils/create-workspace.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuGroup,
		DropdownMenuGroupLabel,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuShortcut,
		DropdownMenuTrigger
	} from '$lib/components/shadcnio/dropdown-menu';
	import {
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		useSidebar
	} from '$lib/components/shadcnio/sidebar';
	import { m } from '$lib/messages';
	import type { User } from '$lib/server/session';
	import { role } from '$lib/stores';

	import CreateWorkspaceTrigger from './create-workspace-trigger.svelte';

	let {
		cluster,
		workspaces,
		user,
		workspace
	}: {
		cluster: string;
		workspaces: TenantOtterscaleIoV1Alpha1Workspace[];
		user: User;
		workspace?: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let activeWorkspace = $derived(
		workspaces.length > 0 && workspace
			? workspaces.find((w) => w.metadata?.name === workspace)
			: undefined
	);
	let isMac = $derived(navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
	let createWorkspaceOpen = $state(false);
	let workspaceSchema: Schema | undefined = $state(undefined);

	onMount(async () => {
		const response = await resourceClient.schema({
			cluster: cluster,
			group: 'tenant.otterscale.io',
			version: 'v1alpha1',
			kind: 'Workspace'
		});
		workspaceSchema = response.schema as Schema;
	});

	const sidebar = useSidebar();

	let ActiveIcon = $derived(getWorkspaceIcon(activeWorkspace?.metadata?.name));

	const workspaceIcons: Component[] = [
		ActivityIcon,
		ApertureIcon,
		AudioWaveformIcon,
		BlocksIcon,
		BoxIcon,
		BriefcaseIcon,
		ChartPieIcon,
		CircleDashedIcon,
		CommandIcon,
		ComponentIcon,
		CrownIcon,
		CylinderIcon,
		DiamondIcon,
		DiscIcon,
		DnaIcon,
		FrameIcon,
		GalleryVerticalEndIcon,
		GemIcon,
		GlobeIcon,
		GridIcon,
		HashIcon,
		HexagonIcon,
		LayersIcon,
		LayoutGridIcon,
		LibraryIcon,
		MedalIcon,
		MountainIcon,
		PackageIcon,
		PyramidIcon,
		RadarIcon,
		ShieldIcon,
		ZapIcon
	];

	function getWorkspaceIcon(name: string | undefined): Component {
		if (!name) return PlusIcon;

		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}

		const index = Math.abs(hash % workspaceIcons.length);
		return workspaceIcons[index];
	}

	function onSelect(index: number) {
		if (index >= workspaces.length) return;

		const workspace = workspaces[index];
		const name = workspace.metadata?.name ?? '';
		goto(resolve(`/(auth)/${cluster}/${name}/dashboard/overview`));
		toast.success(m.switch_workspace({ name: name }));
	}

	$effect(() => {
		if (activeWorkspace) {
			role.set(
				activeWorkspace.spec.members?.find(
					(u: { subject?: string; role?: string }) => u.subject === user.sub
				)?.role ?? ''
			);
		} else {
			role.set('');
		}
	});
</script>

<svelte:window
	use:shortcut={{
		key: '1',
		ctrl: true,
		callback: () => onSelect(0)
	}}
	use:shortcut={{
		key: '2',
		ctrl: true,
		callback: () => onSelect(1)
	}}
	use:shortcut={{
		key: '3',
		ctrl: true,
		callback: () => onSelect(2)
	}}
	use:shortcut={{
		key: '4',
		ctrl: true,
		callback: () => onSelect(3)
	}}
	use:shortcut={{
		key: '5',
		ctrl: true,
		callback: () => onSelect(4)
	}}
	use:shortcut={{
		key: '6',
		ctrl: true,
		callback: () => onSelect(5)
	}}
	use:shortcut={{
		key: '7',
		ctrl: true,
		callback: () => onSelect(6)
	}}
	use:shortcut={{
		key: '8',
		ctrl: true,
		callback: () => onSelect(7)
	}}
	use:shortcut={{
		key: '9',
		ctrl: true,
		callback: () => onSelect(8)
	}}
/>

<SidebarMenu>
	<SidebarMenuItem>
		<DropdownMenu
			positioning={{
				placement: sidebar.isMobile ? 'bottom-start' : 'right-start',
				gutter: 8,
				sameWidth: sidebar.isMobile
			}}
		>
			<DropdownMenuTrigger>
				{#snippet asChild(props)}
					<SidebarMenuButton size="lg" {...props()}>
						<div
							class="relative flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
						>
							<ActiveIcon class="size-4 text-sidebar-primary-foreground!" />
							{#if !activeWorkspace}
								<span class="pointer-events-none absolute -end-1 -top-1 flex size-2.5">
									<span
										class="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-75"
									></span>
									<span class="relative inline-flex size-2.5 rounded-full bg-warning"></span>
								</span>
							{/if}
						</div>
						<div class="grid flex-1 text-start text-sm leading-tight">
							{#if activeWorkspace}
								<span class="truncate font-semibold">{activeWorkspace.metadata?.name}</span>
								<span class="truncate text-xs text-muted-foreground">
									{activeWorkspace.spec.members?.find(
										(u: { subject?: string; role?: string }) => u.subject === user.sub
									)?.role}
								</span>
							{:else}
								<span class="truncate font-semibold">{m.site_title()}</span>
								<span class="truncate text-xs text-muted-foreground">
									{m.no_workspace_selected()}
								</span>
							{/if}
						</div>
						<ChevronsUpDownIcon class="ms-auto size-4" />
					</SidebarMenuButton>
				{/snippet}
			</DropdownMenuTrigger>
			<DropdownMenuContent class="min-w-60">
				<DropdownMenuGroup>
					<DropdownMenuGroupLabel class="text-xs text-muted-foreground">
						{m.workspace()}
					</DropdownMenuGroupLabel>
					{#each workspaces as workspace, index (workspace.metadata?.name)}
						{@const WorkspaceIcon = getWorkspaceIcon(workspace.metadata?.name)}
						{@const isCurrent = workspace.metadata?.name === activeWorkspace?.metadata?.name}
						<DropdownMenuItem
							value={workspace.metadata?.name ?? String(index)}
							onclick={() => onSelect(index)}
							class="gap-2 p-1.5"
						>
							<div
								class="flex size-7 items-center justify-center rounded-md border {isCurrent
									? 'border-primary/30 bg-primary/10 text-primary'
									: 'bg-background'}"
							>
								<WorkspaceIcon class="size-3.5 shrink-0" />
							</div>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">{workspace.metadata?.name}</span>
								<span class="truncate text-xs text-muted-foreground"
									>{workspace.spec.members?.find(
										(u: { subject?: string; role?: string }) => u.subject === user.sub
									)?.role}</span
								>
							</div>
							{#if index < 9}
								<DropdownMenuShortcut>
									{isMac ? '⌘' : 'Ctrl+'}{index + 1}
								</DropdownMenuShortcut>
							{/if}
						</DropdownMenuItem>
					{/each}
				</DropdownMenuGroup>
				{#if activeWorkspace}
					<DropdownMenuSeparator />
					<DropdownMenuItem value="workspace-settings">
						{#snippet asChild(props)}
							<a
								href={resolve(
									`/(auth)/${cluster}/${activeWorkspace.metadata?.name}/${activeWorkspace.metadata?.name}?group=tenant.otterscale.io&version=v1alpha1&kind=Workspace&resource=workspaces`
								)}
								{...props()}
							>
								<Settings2Icon />
								{m.workspace_settings()}
							</a>
						{/snippet}
					</DropdownMenuItem>
				{/if}
				<CreateWorkspaceTrigger bind:open={createWorkspaceOpen} />
			</DropdownMenuContent>
		</DropdownMenu>
	</SidebarMenuItem>
</SidebarMenu>

{#if workspaceSchema}
	<CreateWorkspace
		role={page.data.isClusterAdmin === true ? 'Cluster Admin' : undefined}
		{cluster}
		schema={workspaceSchema}
		group="tenant.otterscale.io"
		version="v1alpha1"
		kind="Workspace"
		resource="workspaces"
		bind:open={createWorkspaceOpen}
		onSuccess={(name) => {
			goto(resolve(`/(auth)/${cluster}/${name}/dashboard/overview`));
		}}
	/>
{/if}
