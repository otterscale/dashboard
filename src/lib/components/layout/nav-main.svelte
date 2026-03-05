<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';

	import { page } from '$app/state';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let {
		label,
		items
	}: {
		label: string;
		items: {
			title: string;
			url: string;
			icon?: Component;
			isActive?: boolean;
			items?: {
				title: string;
				url: string;
				disabled?: boolean;
			}[];
		}[];
	} = $props();

	const isItemActive = (url: string): boolean => url !== '#' && page.url.href.includes(url);
	const isSubItemActive = (url: string): boolean => url !== '#' && page.url.href.includes(url);
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.title)}
			{#if item.items && item.items.length > 0}
				<Collapsible.Root open={item.isActive || isItemActive(item.url)} class="group/collapsible">
					{#snippet child({ props })}
						<Sidebar.MenuItem {...props}>
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
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuAction {...props} class="data-[state=open]:rotate-90">
										<ChevronRightIcon />
										<span class="sr-only">Toggle</span>
									</Sidebar.MenuAction>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each item.items as subItem (subItem.title)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton
												href={subItem.url}
												aria-disabled={subItem.disabled}
												isActive={isSubItemActive(subItem.url)}
											>
												<span>{subItem.title}</span>
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
