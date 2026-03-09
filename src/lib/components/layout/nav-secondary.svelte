<script lang="ts">
	import { BookOpenIcon, PackageIcon } from '@lucide/svelte';
	import type { ComponentProps } from 'svelte';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import { m } from '$lib/paraglide/messages.js';

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
				<Sidebar.MenuButton size="sm" tooltipContent={m.documentation()} class="[&>svg]:size-3.5">
					{#snippet child({ props })}
						<a href="https://otterscale.io" target="_blank" {...props}>
							<BookOpenIcon />
							<span>{m.documentation()}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			{#if harborUrl}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="sm" tooltipContent={m.registry()} class="[&>svg]:size-3.5">
						{#snippet child({ props })}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={harborUrl} target="_blank" {...props}>
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
