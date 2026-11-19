<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';

	import { page } from '$app/state';
	import { Collapsible, CollapsibleContent } from '$lib/components/shadcnio/collapsible';
	import { CollapsibleTrigger } from '$lib/components/shadcnio/collapsible';
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
		SidebarMenuSubItem
	} from '$lib/components/shadcnio/sidebar';
	import { m } from '$lib/messages';

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

	// A group the user opened or closed by hand keeps that choice; the others
	// follow the page: open when they hold the current page or are open by default.
	let toggled = $state<Record<string, boolean>>({});
	function isOpen(item: NavItem): boolean {
		const key = `${activeIndex}:${item.title}`;
		if (key in toggled) return toggled[key];
		return Boolean(item.isActive || item.items?.some((subItem) => matchesUrl(subItem.url)));
	}
</script>

<SidebarGroup class="pb-0 group-data-[collapsible=icon]:hidden">
	<SegmentGroup
		aria-label={m.dash_navigation()}
		value={String(activeIndex)}
		onValueChange={(details) => (activeIndex = Number(details.value))}
		class="w-full gap-0 rounded-lg bg-sidebar-accent/60 p-[3px]"
	>
		{#each views as view, index (index)}
			<SegmentGroupItem
				value={String(index)}
				class="inline-flex h-7 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground data-[state=checked]:text-sidebar-foreground"
			>
				<SegmentGroupItemText>{view.label}</SegmentGroupItemText>
			</SegmentGroupItem>
		{/each}
	</SegmentGroup>
</SidebarGroup>

<SidebarGroup>
	<SidebarMenu>
		{#each currentView.items as item (item.title)}
			{#if item.items && item.items.length > 0}
				<Collapsible
					open={isOpen(item)}
					onOpenChange={(details) => (toggled[`${activeIndex}:${item.title}`] = details.open)}
				>
					{#snippet asChild(rootProps)}
						<SidebarMenuItem {...rootProps()}>
							<CollapsibleTrigger>
								{#snippet asChild(triggerProps)}
									<SidebarMenuButton {...triggerProps()} tooltip={item.title}>
										{#if item.icon}
											<item.icon />
										{/if}
										<span>{item.title}</span>
										<ChevronRightIcon
											class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 motion-reduce:transition-none"
										/>
									</SidebarMenuButton>
								{/snippet}
							</CollapsibleTrigger>
							<CollapsibleContent>
								<SidebarMenuSub>
									{#each item.items as subItem (subItem.title)}
										<SidebarMenuSubItem>
											<!-- eslint-disable svelte/no-navigation-without-resolve -->
											<SidebarMenuSubButton
												isActive={matchesUrl(subItem.url)}
												aria-disabled={subItem.disabled}
												href={subItem.disabled ? undefined : subItem.url}
											>
												<span>{subItem.title}</span>
											</SidebarMenuSubButton>
											<!-- eslint-enable svelte/no-navigation-without-resolve -->
										</SidebarMenuSubItem>
									{/each}
								</SidebarMenuSub>
							</CollapsibleContent>
						</SidebarMenuItem>
					{/snippet}
				</Collapsible>
			{:else}
				<SidebarMenuItem>
					<SidebarMenuButton isActive={matchesUrl(item.url)} tooltip={item.title}>
						{#snippet asChild(linkProps)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={item.url} {...linkProps()}>
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
