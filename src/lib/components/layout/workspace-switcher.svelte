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
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuShortcut,
		DropdownMenuTrigger
	} from '$lib/components/shadcnio/dropdown-menu';
	import { SidebarMenu, SidebarMenuItem, useSidebar } from '$lib/components/shadcnio/sidebar';
	// The icon is a link to the workspace's own page. The shadcn.io button has no
	// link form, so this one stays the project's button (it is a plain anchor).
	import Button from '$lib/components/ui/button/button.svelte';
	import { m } from '$lib/messages';
	import type { User } from '$lib/server/session';
	import { role } from '$lib/stores';
	import { cn } from '$lib/utils';

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
			<div
				class="flex h-12 w-full min-w-0 items-center gap-2 rounded-md p-2 group-data-[collapsible=icon]:p-0 has-[[data-state=open]]:bg-sidebar-accent"
			>
				<Button
					href={activeWorkspace
						? resolve(
								`/(auth)/${cluster}/${activeWorkspace.metadata?.name}/${activeWorkspace.metadata?.name}?group=tenant.otterscale.io&version=v1alpha1&kind=Workspace&resource=workspaces`
							)
						: undefined}
					class="group/icon relative flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground transition"
					disabled={!activeWorkspace}
				>
					<ActiveIcon class="size-4 group-hover/icon:hidden" />
					<Settings2Icon class="hidden size-4 group-hover/icon:block" />
					{#if !activeWorkspace}
						<span class="pointer-events-none absolute -top-1 -right-1 flex size-3">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75"
							></span>
							<span class="relative inline-flex size-3 rounded-full bg-info"></span>
						</span>
					{/if}
				</Button>
				<DropdownMenuTrigger>
					{#snippet asChild(props)}
						<button
							{...props({
								type: 'button',
								class:
									'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden'
							})}
						>
							<span class="grid min-w-0 flex-1 text-sm leading-tight">
								{#if activeWorkspace}
									<span class="truncate font-medium">
										{activeWorkspace.metadata?.name}
									</span>
									<span class="truncate text-xs text-muted-foreground">
										{activeWorkspace.spec.members?.find(
											(u: { subject?: string; role?: string }) => u.subject === user.sub
										)?.role}
									</span>
								{:else}
									<span class="truncate font-medium"> {m.site_title()} </span>
									<span class="truncate text-xs text-muted-foreground">
										{m.no_workspace_selected()}
									</span>
								{/if}
							</span>
							<ChevronsUpDownIcon class="ms-auto size-4 shrink-0 text-muted-foreground" />
						</button>
					{/snippet}
				</DropdownMenuTrigger>
			</div>
			<DropdownMenuContent class="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{m.workspace()}</DropdownMenuLabel>
					{#each workspaces as workspace, index (workspace.metadata?.name)}
						{@const WorkspaceIcon = getWorkspaceIcon(workspace.metadata?.name)}
						<DropdownMenuItem
							value={workspace.metadata?.name ?? String(index)}
							onSelect={() => onSelect(index)}
							class="gap-2 p-2"
						>
							<div class="flex size-7 items-center justify-center rounded-md border">
								<WorkspaceIcon class="size-3.5 shrink-0" />
							</div>
							<div class="grid flex-1 text-start text-xs leading-tight">
								<span class="truncate font-medium">{workspace.metadata?.name}</span>
								<span class="truncate text-[10px] text-muted-foreground"
									>{workspace.spec.members?.find(
										(u: { subject?: string; role?: string }) => u.subject === user.sub
									)?.role}</span
								>
							</div>
							<DropdownMenuShortcut
								class={cn('flex gap-0.5 text-sm tracking-normal', {
									invisible: index >= 9,
									'items-center': isMac
								})}
							>
								{#if isMac}
									<CommandIcon class="size-3" />
								{:else}
									<span class="font-mono tracking-tight">Ctrl</span>
									<span class="font-mono">+</span>
								{/if}
								<span class="font-mono">{index + 1}</span>
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					{/each}
				</DropdownMenuGroup>
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
