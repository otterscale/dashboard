<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import type { Component } from 'svelte';

	import { page } from '$app/state';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Tabs from '$lib/components/ui/tabs';

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

	function matchesCurrentUrl(items: NavItem[]): boolean {
		const current = page.url.pathname + page.url.search;
		return items.some(
			(item) => item.url === current || item.items?.some((subItem) => subItem.url === current)
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
		{ label: platformLabel, icon: LayersIcon, items: platformItems },
		{ label: kubernetesLabel, icon: SquareTerminalIcon, items: kubernetesItems }
	]);
	const currentView = $derived(views[activeIndex]);
	const currentUrl = $derived(page.url.pathname + page.url.search);
</script>

<Sidebar.Group>
	<Tabs.Root
		value={String(activeIndex)}
		onValueChange={(value) => (activeIndex = Number(value))}
		class="group-data-[collapsible=icon]:hidden"
	>
		<Tabs.List class="w-full">
			{#each views as view, index (index)}
				<Tabs.Trigger value={String(index)}>
					{view.label}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>
</Sidebar.Group>

<Sidebar.Group>
	<Sidebar.Menu>
		{#each currentView.items as item (item.title)}
			{#if item.items && item.items.length > 0}
				<Collapsible.Root
					open={item.isActive || item.items.some((subItem) => subItem.url === currentUrl)}
					class="group/collapsible"
				>
					{#snippet child({ props })}
						<Sidebar.MenuItem {...props}>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton {...props} tooltipContent={item.title}>
										{#if item.icon}
											<item.icon />
										{/if}
										<span>{item.title}</span>
										<ChevronRightIcon
											class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each item.items as subItem (subItem.title)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton
												isActive={subItem.url === currentUrl}
												aria-disabled={subItem.disabled}
											>
												{#snippet child({ props })}
													<!-- eslint-disable svelte/no-navigation-without-resolve -->
													<a href={subItem.disabled ? undefined : subItem.url} {...props}>
														<span>{subItem.title}</span>
													</a>
													<!-- eslint-enable svelte/no-navigation-without-resolve -->
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								</Sidebar.MenuSub>
							</Collapsible.Content>
						</Sidebar.MenuItem>
					{/snippet}
				</Collapsible.Root>
			{:else}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={item.url === currentUrl} tooltipContent={item.title}>
						{#snippet child({ props })}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={item.url} {...props}>
								{#if item.icon}
									<item.icon />
								{/if}
								<span>{item.title}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
