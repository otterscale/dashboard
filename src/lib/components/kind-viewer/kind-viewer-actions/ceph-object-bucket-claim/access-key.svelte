<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import KeyIcon from '@lucide/svelte/icons/key';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Secret, ObjectbucketIoV1Alpha1ObjectBucketClaim } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext } from 'svelte';

	import CopyButton from '$lib/components/custom/copy-button/copy-button.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';

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
	let showAccessKeyId = $state(false);
	let showSecretAccessKey = $state(false);

	const name = $derived(object?.metadata?.name ?? '');

	function decodeSecretValue(encoded: string | undefined): string {
		if (!encoded) return '';

		try {
			return atob(encoded);
		} catch {
			return encoded;
		}
	}

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
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			showAccessKeyId = false;
			showSecretAccessKey = false;
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
					Credentials for authenticating with the object storage bucket. Treat them like passwords
					and do not share with unauthorized users.
				</Item.Description>
			</Item.Content>
		</Item.Root>

		{#await fetchSecret()}
			<div class="flex flex-col items-center gap-3 py-8">
				<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
				<p class="text-sm text-muted-foreground">Fetching credentials...</p>
			</div>
		{:then secret}
			{@const accessKeyId = decodeSecretValue(secret?.data?.AWS_ACCESS_KEY_ID)}
			{@const secretAccessKey = decodeSecretValue(secret?.data?.AWS_SECRET_ACCESS_KEY)}

			{#if !secret || !accessKeyId || !secretAccessKey}
				<Alert.Root variant="destructive" class="border-none bg-destructive/5">
					<ShieldAlertIcon />
					<Alert.Title>Credentials unavailable</Alert.Title>
					<Alert.Description>
						Unable to retrieve access credentials for this bucket. The secret may not be ready yet.
					</Alert.Description>
				</Alert.Root>
			{:else}
				<div class="flex flex-col gap-4">
					<Alert.Root class="border-none bg-muted/50">
						<ShieldAlertIcon />
						<Alert.Title>Keep these credentials secure</Alert.Title>
						<Alert.Description>
							Anyone with these keys can read and write to your bucket. Close this dialog when you
							are done.
						</Alert.Description>
					</Alert.Root>

					<div class="flex flex-col gap-2">
						<Label for="access-key-id">AWS Access Key ID</Label>
						<div class="flex items-center gap-2">
							<div class="relative min-w-0 flex-1">
								<Input
									id="access-key-id"
									readonly
									type={showAccessKeyId ? 'text' : 'password'}
									value={accessKeyId}
									class={cn('pr-10 font-mono text-sm', !showAccessKeyId && 'tracking-widest')}
									onfocus={(event) => event.currentTarget.select()}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									class="absolute top-1/2 right-1 -translate-y-1/2"
									aria-label={showAccessKeyId ? 'Hide access key ID' : 'Show access key ID'}
									onclick={() => {
										showAccessKeyId = !showAccessKeyId;
									}}
								>
									{#if showAccessKeyId}
										<EyeOffIcon />
									{:else}
										<EyeIcon />
									{/if}
								</Button>
							</div>
							<CopyButton text={accessKeyId} variant="outline" />
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="secret-access-key">AWS Secret Access Key</Label>
						<div class="flex items-center gap-2">
							<div class="relative min-w-0 flex-1">
								<Input
									id="secret-access-key"
									readonly
									type={showSecretAccessKey ? 'text' : 'password'}
									value={secretAccessKey}
									class={cn('pr-10 font-mono text-sm', !showSecretAccessKey && 'tracking-widest')}
									onfocus={(event) => event.currentTarget.select()}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									class="absolute top-1/2 right-1 -translate-y-1/2"
									aria-label={showSecretAccessKey
										? 'Hide secret access key'
										: 'Show secret access key'}
									onclick={() => {
										showSecretAccessKey = !showSecretAccessKey;
									}}
								>
									{#if showSecretAccessKey}
										<EyeOffIcon />
									{:else}
										<EyeIcon />
									{/if}
								</Button>
							</div>
							<CopyButton text={secretAccessKey} variant="outline" />
						</div>
					</div>

					<p class="text-xs text-muted-foreground">
						Credentials are hidden by default. Use the eye icon to reveal temporarily.
					</p>
				</div>
			{/if}

			<Button
				class="mt-4 w-full"
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
