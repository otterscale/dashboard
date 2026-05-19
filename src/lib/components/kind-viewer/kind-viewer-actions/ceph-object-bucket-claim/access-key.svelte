<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { KeyIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		CoreV1ConfigMap,
		CoreV1Secret,
		ObjectbucketIoV1Alpha1ObjectBucketClaim
	} from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		object: ObjectbucketIoV1Alpha1ObjectBucketClaim;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let open = $state(false);
	let isPatching = $state(false);

	const name = $derived(object?.metadata?.name ?? '');

	$effect(() => {
		if (open) {
			untrack(() => applyKServeAnnotations());
		}
	});

	async function fetchSecret(): Promise<CoreV1Secret | null> {
		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name,
				group: '',
				version: 'v1',
				resource: 'secrets'
			});
			return response?.object as CoreV1Secret;
		} catch {
			return null;
		}
	}

	async function fetchWorkspaceConfiguration(): Promise<CoreV1ConfigMap | null> {
		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name: 'workspace-config',
				group: '',
				version: 'v1',
				resource: 'configmaps'
			});
			return response.object as CoreV1ConfigMap;
		} catch {
			return null;
		}
	}

	function applyKServeAnnotations() {
		if (isPatching) return;
		isPatching = true;

		toast.promise(
			async () => {
				const workspaceConfiguration = await fetchWorkspaceConfiguration();
				const endpoint = lodash.get(
					workspaceConfiguration,
					['data', 'ObjectGatewayEndpoint'],
					''
				) as string;
				if (!endpoint) {
					throw new Error('ObjectGatewayEndpoint not found in workspace-config');
				}

				const manifest = new TextEncoder().encode(
					stringify({
						apiVersion: 'v1',
						kind: 'Secret',
						metadata: {
							name,
							namespace,
							annotations: {
								'serving.kserve.io/s3-endpoint': endpoint,
								'serving.kserve.io/s3-usehttps': '0',
								'serving.kserve.io/s3-verifyssl': '0',
								'serving.kserve.io/s3-useanoncredential': 'false'
							}
						}
					})
				);

				await resourceClient.apply({
					cluster,
					namespace,
					name,
					group: '',
					version: 'v1',
					resource: 'secrets',
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
				});
			},
			{
				loading: `Configuring ${name} for KServe...`,
				success: () => `Successfully configured ${name} for KServe`,
				error: (error) => {
					console.error(`Failed to configure ${name} for KServe:`, error);
					return `Failed to configure ${name} for KServe: ${(error as ConnectError).message}`;
				},
				finally() {
					isPatching = false;
				}
			}
		);
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			onOpenChangeComplete?.();
		}
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<KeyIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Access Key</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Access Key</Item.Title>
				<Item.Description>
					The Access Key is used to authenticate and access the object storage bucket. Keep it
					secure and do not share it with unauthorized users.
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#await fetchSecret()}
			<div class="flex flex-col items-center gap-3 py-8">
				<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
				<p class="text-sm text-muted-foreground">fetching secret...</p>
			</div>
		{:then secret}
			<Item.Root variant="muted">
				<Item.Content class="text-left">
					<Item.Title class="mb-2 text-sm font-medium">AWS ACCESS KEY ID</Item.Title>
					{secret?.data?.AWS_ACCESS_KEY_ID}
				</Item.Content>
			</Item.Root>
			<Item.Root variant="muted">
				<Item.Content class="text-left">
					<Item.Title class="mb-2 text-sm font-medium">AWS SECRET ACCESS KEY</Item.Title>
					{secret?.data?.AWS_SECRET_ACCESS_KEY}
				</Item.Content>
			</Item.Root>
			<Button
				class="mt-auto w-full"
				onclick={() => {
					open = false;
				}}
			>
				Close
			</Button>
		{:catch error}
			<div class="flex flex-col gap-4 py-4">
				<div
					class="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
				>
					{lodash.get(error, 'message', 'Unknown error')}
				</div>
			</div>
		{/await}
	</Dialog.Content>
</Dialog.Root>
