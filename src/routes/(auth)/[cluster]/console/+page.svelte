<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Create from '$lib/components/kind-viewer/kind-viewer-actions/workspace/create.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.ts';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';
	import { cn } from '$lib/utils';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.console(),
			url: resolve('/(auth)/[cluster]/console', { cluster: page.params.cluster! })
		}
	]);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const group = 'tenant.otterscale.io';
	const version = 'v1alpha1';
	const kind = 'Workspace';
	const resource = 'workspaces';

	const role = $derived(page.data.isClusterAdmin === true ? 'Cluster Admin' : undefined);
	const cluster = $derived(page.params.cluster!);

	const sidebar = useSidebar();
</script>

<div
	class={cn(
		'pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-2 transition-all duration-200 ease-linear',
		sidebar.open ? 'ml-(--sidebar-width)' : ''
	)}
>
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<FolderPlusIcon />
			</Empty.Media>
			<Empty.Title>{m.console_title_add_workspace()}</Empty.Title>
			<Empty.Description>
				{m.console_description_add_workspace({ cluster: page.params.cluster! })}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			{#await resourceClient.schema( { cluster: cluster, group: group, version: version, kind: kind } )}
				<Button disabled>Create</Button>
			{:then response}
				{@const schema = response.schema}
				{#if schema}
					<Create
						{role}
						{cluster}
						{schema}
						{group}
						{version}
						{kind}
						{resource}
						onSuccess={(name) => {
							goto(resolve(`/(auth)/${cluster}/${name}/dashboard/overview`));
						}}
					>
						{#snippet trigger(state)}
							<Button
								class="pointer-events-auto"
								onclick={() => {
									state.open = !state.open;
								}}
							>
								Create
							</Button>
						{/snippet}
					</Create>
				{/if}
			{/await}
		</Empty.Content>
	</Empty.Root>
</div>
