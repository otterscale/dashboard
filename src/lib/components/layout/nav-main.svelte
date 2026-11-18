<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';

	import { page } from '$app/state';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/shadcnio/collapsible';
	import {
		SegmentGroup,
		SegmentGroupItem,
		SegmentGroupItemText
	} from '$lib/components/shadcnio/segment-group';
	import {
		SidebarGroup,
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		SidebarMenuSub,
		SidebarMenuSubButton,
		SidebarMenuSubItem,
		useSidebar
	} from '$lib/components/shadcnio/sidebar';

	type NavItem = {
		title: string;
		url?: string;
		icon?: Component;
		isActive?: boolean;
		items?: {
			title: string;
			url?: string;
			disabled?: boolean;
		}[];
	};

	let {
		platformLabel,
		platformItems,
		kubernetesLabel,
		kubernetesItems
	}: {
		platformLabel: string;
		platformItems: NavItem[];
		kubernetesLabel: string;
		kubernetesItems: NavItem[];
	} = $props();

	const sidebar = useSidebar();

	const currentUrl = $derived(page.url.pathname + page.url.search);

	// Items without a query string point at a dedicated page, so match on the
	// pathname alone: such pages may append their own search parameters after
	// loading. Items with a query string all share a single pathname, so only a
	// full match tells them apart.
	function matchesUrl(url: string | undefined): boolean {
		if (!url) return false;
		return url.includes('?') ? url === currentUrl : url === page.url.pathname;
	}

	function matchesCurrentUrl(items: NavItem[]): boolean {
		return items.some(
			(item) => matchesUrl(item.url) || item.items?.some((subItem) => matchesUrl(subItem.url))
		);
	}

	let activeIndex = $state(0);

	$effect(() => {
		if (matchesCurrentUrl(kubernetesItems)) {
			activeIndex = 1;
		} else if (matchesCurrentUrl(platformItems)) {
			activeIndex = 0;
		}
	});

	const views = $derived([
		{ label: platformLabel, items: platformItems },
		{ label: kubernetesLabel, items: kubernetesItems }
	]);
	const currentView = $derived(views[activeIndex]);

	// Collapsed to icons there is no room for a sub-menu: open the sidebar instead.
	function expandIfCollapsed() {
		if (sidebar.state === 'collapsed' && !sidebar.isMobile) sidebar.setOpen(true);
	}
</script>

<SidebarGroup class="pb-0 group-data-[collapsible=icon]:hidden">
	<SegmentGroup
		aria-label={`${platformLabel} / ${kubernetesLabel}`}
		value={String(activeIndex)}
		onValueChange={(details) => (activeIndex = Number(details.value))}
		class="w-full gap-0 rounded-lg bg-sidebar-foreground/6 p-0.5 *:data-[slot=segment-group-indicator]:rounded-md *:data-[slot=segment-group-indicator]:bg-background *:data-[slot=segment-group-indicator]:shadow-xs dark:*:data-[slot=segment-group-indicator]:bg-sidebar-foreground/15"
	>
		{#each views as view, index (index)}
			<SegmentGroupItem
				value={String(index)}
				class="flex h-7 flex-1 items-center justify-center rounded-md text-xs font-medium text-sidebar-foreground/70 data-checked:text-sidebar-foreground"
			>
				<SegmentGroupItemText class="relative z-1">{view.label}</SegmentGroupItemText>
			</SegmentGroupItem>
		{/each}
	</SegmentGroup>
</SidebarGroup>

<SidebarGroup>
	<SidebarMenu>
		{#each currentView.items as item (item.title)}
			{#if item.items && item.items.length > 0}
				{@const containsCurrent = item.items.some((subItem) => matchesUrl(subItem.url))}
				<SidebarMenuItem>
					<Collapsible defaultOpen={item.isActive || containsCurrent} class="group/collapsible">
						<CollapsibleTrigger>
							{#snippet asChild(props)}
								<SidebarMenuButton
									{...props({ onclick: expandIfCollapsed })}
									tooltip={item.title}
									isActive={containsCurrent && sidebar.state === 'collapsed'}
								>
									{#if item.icon}
										<item.icon />
									{/if}
									<span>{item.title}</span>
									<ChevronRightIcon
										class="ms-auto size-3.5! transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
									/>
								</SidebarMenuButton>
							{/snippet}
						</CollapsibleTrigger>
						<CollapsibleContent class="group-data-[collapsible=icon]:hidden">
							<SidebarMenuSub>
								{#each item.items as subItem (subItem.title)}
									<SidebarMenuSubItem>
										<!-- eslint-disable svelte/no-navigation-without-resolve -->
										<SidebarMenuSubButton
											href={subItem.disabled ? undefined : subItem.url}
											isActive={matchesUrl(subItem.url)}
											aria-current={matchesUrl(subItem.url) ? 'page' : undefined}
											aria-disabled={subItem.disabled}
										>
											<span>{subItem.title}</span>
										</SidebarMenuSubButton>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									</SidebarMenuSubItem>
								{/each}
							</SidebarMenuSub>
						</CollapsibleContent>
					</Collapsible>
				</SidebarMenuItem>
			{:else}
				<SidebarMenuItem>
					<SidebarMenuButton isActive={matchesUrl(item.url)} tooltip={item.title}>
						{#snippet asChild(props)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.url}
								aria-current={matchesUrl(item.url) ? 'page' : undefined}
								{...props()}
							>
								{#if item.icon}
									<item.icon />
								{/if}
								<span>{item.title}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/snippet}
					</SidebarMenuButton>
				</SidebarMenuItem>
			{/if}
		{/each}
	</SidebarMenu>
</SidebarGroup>
