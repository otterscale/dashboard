<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';

	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Sidebar from '$lib/components/ui/sidebar';

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

	let activeIndex = $state(0);

	const currentLabel = $derived(activeIndex === 0 ? platformLabel : kubernetesLabel);
	const currentItems = $derived(activeIndex === 0 ? platformItems : kubernetesItems);

	function toggleLabel() {
		activeIndex = 1 - activeIndex;
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel
		onclick={toggleLabel}
		class="w-full cursor-pointer outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sidebar-ring"
	>
		{currentLabel}
	</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each currentItems as item (item.title)}
			{#if item.items && item.items.length > 0}
				<Collapsible.Root open={item.isActive} class="group/collapsible">
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
											<Sidebar.MenuSubButton aria-disabled={subItem.disabled}>
												{#snippet child({ props })}
													<!-- eslint-disable svelte/no-navigation-without-resolve -->
													<a href={subItem.url} {...props}>
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
					<Sidebar.MenuButton tooltipContent={item.title}>
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
