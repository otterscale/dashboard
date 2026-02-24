<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Pencil } from '@lucide/svelte';
	import { type TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { type GetRequest, ResourceService } from '$lib/api/resource/v1/resource_pb';
	import BasicTierImage from '$lib/assets/basic-tier.jpg';
	import type { K8sOpenAPISchema } from '$lib/components/custom/schema-form';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';

	import EditWorkspaceForm from './edit-form.svelte';

	let {
		name,
		schema,
		object,
		onsuccess
	}: {
		name: string;
		schema: K8sOpenAPISchema;
		object: Record<string, unknown>;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let role: string | undefined = $state('');

	let open = $state(false);

	function handleClose() {
		open = false;
		onsuccess?.();
	}

	onMount(async () => {
		const response = await resourceClient.get({
			cluster: page.params.cluster ?? page.params.scope ?? '',
			group: 'tenant.otterscale.io',
			version: 'v1alpha1',
			resource: 'workspaces',
			name: 'test-workspace-3'
		} as GetRequest);
		role = (response.object as TenantOtterscaleIoV1Alpha1Workspace).spec.users.find(
			(user) => user.subject === page.data.user.sub
		)?.role;
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger
		disabled={role === 'view'}
		class={buttonVariants({ variant: 'outline', size: 'icon' })}
	>
		<Pencil />
	</Sheet.Trigger>
	<Sheet.Content class="inset-y-auto bottom-0 h-9/10 rounded-tl-lg sm:max-w-4/5">
		<Sheet.Header class="h-full p-0">
			<div class="flex h-full">
				<div class="flex-1 overflow-y-auto p-6">
					{#if name && schema && object}
						<EditWorkspaceForm {name} {schema} {object} onsuccess={handleClose} />
					{:else}
						<div class="flex h-full items-center justify-center">
							<p class="text-muted-foreground">No workspace selected.</p>
						</div>
					{/if}
				</div>
				<!-- Workspace Image -->
				<div class="relative hidden w-2/5 lg:block">
					<img
						src={BasicTierImage}
						alt="Workspace"
						class="absolute inset-0 size-full object-cover"
					/>
				</div>
			</div>
		</Sheet.Header>
	</Sheet.Content>
</Sheet.Root>
