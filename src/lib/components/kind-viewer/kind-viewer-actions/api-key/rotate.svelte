<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import {
		decryptApiKey,
		deleteStashedPrivateKey,
		exportPublicKey,
		generateKeyPair,
		stashId,
		stashPrivateKey
	} from '$lib/components/api-keys/crypto';
	import {
		type ApiKeyObject,
		createdBy,
		describeApiKeyError,
		fetchKubernetesUsername,
		rotateApiKey,
		waitForIssuedKey
	} from '$lib/components/api-keys/service';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/messages';

	let {
		cluster,
		namespace,
		apiKey,
		onOpenChangeComplete,
		onRevealKey
	}: {
		cluster: string;
		namespace: string;
		apiKey: ApiKeyObject;
		onOpenChangeComplete?: () => void;
		onRevealKey: (plainKey: string, apiKey: ApiKeyObject, stashedKeyId: string) => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	let open = $state(false);
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let username = $state('');

	const name = $derived(apiKey.metadata.name);
	const isOthers = $derived(Boolean(username) && createdBy(apiKey) !== username);

	onMount(async () => {
		try {
			username = await fetchKubernetesUsername(client, cluster);
		} catch (error) {
			// Only needed for the "someone else's key" warning.
			console.warn('[api-keys] username lookup failed:', error);
		}
	});

	async function submit() {
		if (isSubmitting) return;
		isSubmitting = true;
		errorMessage = '';
		let id = '';
		let rotated = false;

		try {
			const keyPair = await generateKeyPair();
			const publicKey = await exportPublicKey(keyPair.publicKey);

			const { generation } = await rotateApiKey(client, { cluster, namespace, name, publicKey });
			rotated = true;
			id = stashId(cluster, namespace, name, generation);
			await stashPrivateKey(id, keyPair.privateKey);

			const issued = await waitForIssuedKey(client, { cluster, namespace, name, generation });
			const plainKey = await decryptApiKey(keyPair.privateKey, issued.status!.encryptedKey!);

			open = false;
			onRevealKey(plainKey, issued, id);
		} catch (error) {
			console.error('[api-keys] rotate failed:', error);
			errorMessage = describeApiKeyError(error);
			toast.error(m.api_key_rotate_failed({ name }));
			if (!rotated && id) void deleteStashedPrivateKey(id);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) errorMessage = '';
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<RefreshCwIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>{m.api_key_rotate()}</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[95vh] min-w-[24vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Dialog.Header>
			<Dialog.Title class="text-xl font-bold">{m.api_key_rotate_title({ name })}</Dialog.Title>
			<Dialog.Description>
				{#if apiKey.status?.keyPrefix}
					<span class="font-mono">{apiKey.status.keyPrefix}…</span>
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<Alert.Root variant="destructive" class="border-none bg-destructive/5">
			<TriangleAlertIcon class="size-4" />
			<Alert.Title class="font-bold">{m.api_key_rotate()}</Alert.Title>
			<Alert.Description class="text-start">
				{m.api_key_rotate_warning()}
				{#if isOthers}
					<br />
					{m.api_key_rotate_other_warning({ user: createdBy(apiKey) })}
				{/if}
			</Alert.Description>
		</Alert.Root>

		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" disabled={isSubmitting} onclick={() => (open = false)}>
				{m.cancel()}
			</Button>
			<Button variant="destructive" disabled={isSubmitting} onclick={submit}>
				{#if isSubmitting}
					<Spinner class="size-4" />
					{m.api_key_waiting()}
				{:else}
					{m.api_key_rotate()}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
