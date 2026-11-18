<script lang="ts">
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import PackageIcon from '@lucide/svelte/icons/package';

	import {
		SidebarGroup,
		SidebarGroupContent,
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem
	} from '$lib/components/shadcnio/sidebar';
	import { m } from '$lib/messages';

	import DialogAbout from './dialog-about.svelte';

	let { harborUrl, class: className }: { harborUrl?: string; class?: string } = $props();

	let open = $state(false);
</script>

<DialogAbout bind:open />

<SidebarGroup class={className}>
	<SidebarGroupContent>
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="sm" tooltip={m.support()} onclick={() => (open = true)}>
					<LifeBuoyIcon />
					<span>{m.support()}</span>
				</SidebarMenuButton>
			</SidebarMenuItem>
			{#if harborUrl}
				<SidebarMenuItem>
					<SidebarMenuButton size="sm" tooltip={m.registry()}>
						{#snippet asChild(props)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={harborUrl} target="_blank" rel="noopener noreferrer" {...props()}>
								<PackageIcon />
								<span>{m.registry()}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/snippet}
					</SidebarMenuButton>
				</SidebarMenuItem>
			{/if}
		</SidebarMenu>
	</SidebarGroupContent>
</SidebarGroup>
