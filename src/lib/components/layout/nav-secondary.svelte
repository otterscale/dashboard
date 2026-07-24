<script lang="ts">
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import PackageIcon from '@lucide/svelte/icons/package';
	import type { ComponentProps } from 'svelte';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import { m } from '$lib/messages';

	import DialogAbout from './dialog-about.svelte';

	type Props = ComponentProps<typeof Sidebar.Group> & { harborUrl?: string };

	let { ref = $bindable(null), harborUrl, ...restProps }: Props = $props();

	let open = $state(false);
</script>

<DialogAbout bind:open />

<Sidebar.Group bind:ref {...restProps}>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="sm" tooltipContent={m.support()}>
					{#snippet child({ props })}
						<button type="button" {...props} onclick={() => (open = true)}>
							<LifeBuoyIcon />
							<span>{m.support()}</span>
						</button>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			{#if harborUrl}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="sm" tooltipContent={m.registry()}>
						{#snippet child({ props })}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={harborUrl} target="_blank" rel="noopener noreferrer" {...props}>
								<PackageIcon />
								<span>{m.registry()}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
