<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import UserIcon from '@lucide/svelte/icons/user';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Secret } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let open = $state(false);

	const storeName = $derived(object?.metadata?.name ?? '');
	const storeNamespace = $derived(object?.metadata?.namespace ?? '');
	const userSubject = $derived(page.data.user.sub);
	const userDisplayName = $derived(page.data.user.name ?? page.data.user.username ?? '');
	const secretName = $derived(`rook-ceph-object-user-ceph-objectstore-${userSubject}`);

	async function fetchExistingSecret(): Promise<CoreV1Secret | null> {
		try {
			const response = await resourceClient.get({
				cluster,
				namespace: storeNamespace,
				group: '',
				version: 'v1',
				resource: 'secrets',
				name: secretName
			});
			return response?.object as CoreV1Secret;
		} catch {
			return null;
		}
	}

	async function createUserAndFetchSecret(): Promise<CoreV1Secret> {
		const existing = await fetchExistingSecret();
		if (existing) {
			return existing;
		}

		const userManifest = {
			apiVersion: 'ceph.rook.io/v1',
			kind: 'CephObjectStoreUser',
			metadata: {
				name: userSubject,
				namespace: storeNamespace
			},
			spec: {
				store: storeName,
				displayName: userDisplayName
			}
		};

		const manifest = new TextEncoder().encode(stringify(userManifest));
		await resourceClient.create({
			cluster,
			namespace: storeNamespace,
			group: 'ceph.rook.io',
			version: 'v1',
			resource: 'cephobjectstoreusers',
			manifest
		});

		toast.success(`Successfully created CephObjectStoreUser ${userSubject}`);

		// Poll for the secret to be created by the controller
		const maxRetries = 10;
		const retryInterval = 3_000;

		for (let index = 0; index < maxRetries; index++) {
			await new Promise((resolve) => setTimeout(resolve, retryInterval));

			const secret = await fetchExistingSecret();
			if (secret) {
				return secret;
			}
		}

		throw new Error(
			`Secret ${secretName} was not found after ${maxRetries} retries. It may take longer to be created by the controller.`
		);
	}
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			onOpenChangeComplete?.();
		}
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<UserIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Get User</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Get User</Item.Title>
				<Item.Description>
					User for {storeName}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#await createUserAndFetchSecret()}
			<div class="flex flex-col items-center gap-3 py-8">
				<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
				<p class="text-sm text-muted-foreground">Creating or fetching user and secret...</p>
			</div>
		{:then secret}
			<Item.Root variant="muted">
				<Item.Content class="text-left">
					<Item.Title class="mb-2 text-sm font-medium">Access Key</Item.Title>
					{secret.data?.AccessKey}
				</Item.Content>
			</Item.Root>
			<Item.Root variant="muted">
				<Item.Content class="text-left">
					<Item.Title class="mb-2 text-sm font-medium">Secret Key</Item.Title>
					{secret.data?.SecretKey}
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
	</AlertDialog.Content>
</AlertDialog.Root>
